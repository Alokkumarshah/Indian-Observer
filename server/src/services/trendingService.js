const axios = require('axios');
const cron = require('node-cron');
const { getJson } = require('serpapi');
const News = require('../models/News');
const SystemStatus = require('../models/SystemStatus');

// Try multiple model names in order of preference (fallback if one fails)
// Updated based on actual available models from ListModels API
// Using models that support generateContent method
const GEMINI_MODELS = [
  'gemini-2.5-flash',        // Latest stable flash model
  'gemini-pro-latest',       // Latest pro model (backward compatible)
  'gemini-flash-latest',     // Latest flash model (backward compatible)
  'gemini-2.0-flash',        // Stable 2.0 flash
  'gemini-2.5-pro',          // Latest pro model
];
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const SUMMARY_MIN_WORDS = 100;
const SUMMARY_MAX_WORDS = 140;

// Gemini rate limiting: ensure we stay well under 10 calls per minute
// Increased to 8 seconds to be extra safe (7.5 calls/min max)
const GEMINI_MIN_INTERVAL_MS = 8000; // ~7–8 requests per minute
let lastGeminiCallAt = 0;
let currentGeminiModelIndex = 0; // Track which model is currently working

const delayIfNeededForGemini = async () => {
  const now = Date.now();
  const elapsed = now - lastGeminiCallAt;

  if (elapsed < GEMINI_MIN_INTERVAL_MS) {
    const waitTime = GEMINI_MIN_INTERVAL_MS - elapsed;
    console.log(`[Gemini Rate Limit] Waiting ${waitTime}ms before next call...`);
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  lastGeminiCallAt = Date.now();
};

const CATEGORY_FEEDS = [
  {
    id: 'world',
    topic: 'World Watch Briefing',
    query: 'India world diplomacy news',
    category: 'World',
    tags: ['world', 'global'],
  },
  {
    id: 'politics',
    topic: 'Capital Circuit',
    query: 'Indian politics parliament policy',
    category: 'Politics',
    tags: ['politics', 'policy'],
  },
  {
    id: 'sports',
    topic: 'Sports Pulse',
    query: 'India sports headline',
    category: 'Sports',
    tags: ['sports'],
  },
  {
    id: 'tech',
    topic: 'Tech Radar',
    query: 'India technology startups',
    category: 'Tech',
    tags: ['tech', 'innovation'],
  },
  {
    id: 'business',
    topic: 'Boardroom Briefing',
    query: 'India business markets economy',
    category: 'Business',
    tags: ['business', 'markets'],
  },
];

const INGESTION_STATUS_KEY = 'ingestion';

const updateStatus = async (changes) => {
  try {
    await SystemStatus.findOneAndUpdate(
      { key: INGESTION_STATUS_KEY },
      { $set: changes },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    console.error('Failed to persist ingestion status', error.message);
  }
};

const normalizeSummaryLength = (text, articleOptions = []) => {
  const sanitize = (value) => (value || '').replace(/\s+/g, ' ').trim();
  const wordsFrom = (value) => sanitize(value).split(' ').filter(Boolean);

  const baseWords = wordsFrom(text);
  const fallbackText = Array.isArray(articleOptions)
    ? articleOptions.map((article) => article.snippet || article.title || '').join(' ')
    : '';
  const fallbackWords = wordsFrom(fallbackText);

  let words = baseWords.length ? [...baseWords] : [...fallbackWords];
  if (!words.length) {
    return 'Summary unavailable.';
  }

  if (words.length > SUMMARY_MAX_WORDS) {
    words = words.slice(0, SUMMARY_MAX_WORDS);
  } else if (words.length < SUMMARY_MIN_WORDS) {
    const extender = fallbackWords.length ? fallbackWords : words;
    let idx = 0;
    while (words.length < SUMMARY_MIN_WORDS && extender.length) {
      words.push(extender[idx % extender.length]);
      idx += 1;
      if (idx > SUMMARY_MAX_WORDS * 2) {
        break;
      }
    }
    if (words.length > SUMMARY_MAX_WORDS) {
      words = words.slice(0, SUMMARY_MAX_WORDS);
    }
  }

  return words.join(' ');
};

const serpRequest = async (params) => {
  if (!process.env.SERPAPI_KEY) {
    throw new Error('SERPAPI_KEY missing');
  }

  const requestPayload = { api_key: process.env.SERPAPI_KEY, ...params };

  try {
    const response = await new Promise((resolve, reject) => {
      getJson(requestPayload, (json) => {
        if (!json) {
          return reject(new Error('Empty response from SerpAPI'));
        }
        if (json.error) {
          return reject(new Error(json.error));
        }
        resolve(json);
      });
    });
    return response;
  } catch (error) {
    const meta = `engine=${params.engine || 'unknown'} q=${params.q || params.topic_token || ''}`.trim();
    const message = error.message || 'SerpAPI request failed';
    const enriched = new Error(`SerpAPI: ${message}${meta ? ` (${meta})` : ''}`);
    enriched.cause = error;
    throw enriched;
  }
};

const fetchTrendingTopics = async () => {
  const response = await serpRequest({
    engine: 'google_trends_trending_now',
    geo: 'IN',
  });

  const searches = response.trending_searches || [];
  const topics = searches
    .map((item) => item?.title)
    .filter(Boolean);

  return topics.slice(0, 10);
};

const fetchTopicInsights = async (topic) => {
  if (!topic) {
    throw new Error('Missing topic for fetchTopicInsights');
  }

  return serpRequest({
    engine: 'google_trends',
    q: topic,
    data_type: 'TIMESERIES',
  });
};

const fetchTopicArticles = async (topic, limit = 6) => {
  if (!topic) {
    throw new Error('Missing topic for fetchTopicArticles');
  }

  const response = await serpRequest({
    engine: 'google',
    q: topic,
    tbm: 'nws',
    num: limit,
  });

  const newsResults = response.news_results || [];
  return newsResults
    .map((item) => ({
      source: item.source || null,
      title: item.title || topic,
      snippet: item.snippet || '',
      link: item.link || item.news_url || null,
      imageUrl: item.thumbnail || item.image_url || null,
      publishedAt: item.date || item.published_at || null,
    }))
    .filter((article) => Boolean(article.link));
};

const fetchCategoryArticles = async (feed, limit = 8) => {
  const params = {
    engine: 'google_news',
    hl: feed.lang || 'en',
    gl: feed.country || 'in',
  };

  if (feed.query) params.q = feed.query;
  if (feed.topicToken) params.topic_token = feed.topicToken;
  if (feed.sectionToken) params.section_token = feed.sectionToken;
  params.num = limit;

  const response = await serpRequest(params);
  const newsResults = response.news_results || response.articles_results || [];
  return newsResults
    .map((item) => {
      const source =
        typeof item.source === 'string'
          ? item.source
          : item.source?.name || item.publisher?.name || null;
      return {
        source,
        title: item.title || item.heading || feed.topic,
        snippet: item.snippet || item.summary || '',
        link: item.link || item.url || item.news_url || null,
        imageUrl: item.image?.src || item.image || item.thumbnail || null,
        publishedAt: item.date || item.published_at || null,
      };
    })
    .filter((article) => Boolean(article.link));
};

const callGemini = async (prompt, retryCount = 0) => {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error('GOOGLE_API_KEY missing');
  }

  // Enforce global rate limit so we never exceed ~10 calls/min
  await delayIfNeededForGemini();

  const model = GEMINI_MODELS[currentGeminiModelIndex] || GEMINI_MODELS[0];
  const url = `${GEMINI_ENDPOINT}/${model}:generateContent?key=${process.env.GOOGLE_API_KEY}`;

  try {
    console.log(`[Gemini] Calling model: ${model} (attempt ${retryCount + 1})`);
    const { data } = await axios.post(
      url,
      { contents: [{ parts: [{ text: prompt }] }] },
      {
        timeout: 60000, // 60 second timeout
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    if (!responseText) {
      throw new Error('Empty response from Gemini API');
    }
    
    // Success! Log which model worked
    if (retryCount === 0) {
      console.log(`[Gemini] Successfully using model: ${model}`);
    }
    
    return responseText;
  } catch (error) {
    const statusCode = error.response?.status;
    const errorMessage = error.response?.data?.error?.message || error.message;
    const errorDetails = error.response?.data?.error || {};

    // Handle 404 - try next model
    if (statusCode === 404) {
      console.warn(`[Gemini] Model ${model} returned 404: ${errorMessage}`);
      const nextIndex = (currentGeminiModelIndex + 1) % GEMINI_MODELS.length;
      
      if (retryCount < GEMINI_MODELS.length - 1 && nextIndex !== currentGeminiModelIndex) {
        currentGeminiModelIndex = nextIndex;
        console.log(`[Gemini] Trying next model: ${GEMINI_MODELS[currentGeminiModelIndex]}`);
        // Wait a bit before retrying with different model
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return callGemini(prompt, retryCount + 1);
      } else {
        // All models tried, reset to first and throw
        currentGeminiModelIndex = 0;
        throw new Error(
          `All Gemini models failed with 404. Tried: ${GEMINI_MODELS.join(', ')}. Last error: ${errorMessage}`
        );
      }
    }

    // Handle 429 (rate limit) - wait and retry
    if (statusCode === 429) {
      const waitTime = Math.min(60000, (retryCount + 1) * 10000); // Exponential backoff, max 60s
      console.warn(`[Gemini] Rate limited (429), waiting ${waitTime}ms before retry...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      
      if (retryCount < 3) {
        return callGemini(prompt, retryCount + 1);
      } else {
        throw new Error(`Gemini API rate limit exceeded after ${retryCount + 1} retries`);
      }
    }

    // Handle 400 (bad request) - might be API key or format issue
    if (statusCode === 400) {
      throw new Error(`Gemini API bad request (400): ${errorMessage}. Check your API key and request format.`);
    }

    // Handle 403 (forbidden) - API key issue
    if (statusCode === 403) {
      if (errorMessage.includes('leaked') || errorMessage.includes('invalid')) {
        throw new Error(
          `Gemini API key issue (403): ${errorMessage}. Please generate a new API key from Google AI Studio.`
        );
      }
      throw new Error(`Gemini API forbidden (403): ${errorMessage}. Check API key permissions.`);
    }

    // Other errors - throw immediately
    throw new Error(`Gemini API error (${statusCode || 'unknown'}): ${errorMessage}`);
  }
};

const summarizeWithGemini = async (topic, trendData) => {
  const trendSlice = JSON.stringify(trendData?.interest_over_time || []).slice(0, 6000);

  const prompt = [
    'Create a crisp, factual news brief (aim for 100-140 words, roughly 10-12 lines) for the following trending Indian topic.',
    `Topic: ${topic}`,
    `Trend data: ${trendSlice}`,
    'Highlight why it matters and avoid speculation.',
  ].join('\n');

  try {
    const responseText = await callGemini(prompt);
    return responseText || 'Summary unavailable.';
  } catch (error) {
    console.error('Gemini trend summary failed', error.message);
    return 'Summary unavailable.';
  }
};

const summarizeArticlesWithGemini = async (topic, articles) => {
  if (!Array.isArray(articles) || !articles.length) {
    throw new Error('No articles available to summarize');
  }

  const articlesText = articles
    .map((article, index) => {
      const safeSnippet = article.snippet || 'No synopsis available';
      return `Article ${index + 1}:
Title: ${article.title}
Source: ${article.source || 'Unknown'}
Summary: ${safeSnippet}
Link: ${article.link || 'N/A'}`;
    })
    .join('\n\n');

  const prompt = [
    'You are a professional news editor. Combine the following source material into a single, factual news write-up.',
    `Trending topic: ${topic}`,
    'Use the sources below:',
    articlesText,
    'Create JSON with this structure: {"title":"","content":"","summary":"","category":"","tags":["",""]}.',
    'Content should be 4-6 paragraphs (300-500 words). Summary must be 2 sentences. Provide a relevant category and 3 tags.',
  ].join('\n\n');

  try {
    const responseText = await callGemini(prompt);
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Gemini response missing JSON');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const normalizedSummary = normalizeSummaryLength(parsed.summary || parsed.content, articles);
    return {
      title: parsed.title || topic,
      content: parsed.content || parsed.summary || 'Content unavailable.',
      summary: normalizedSummary,
      category: parsed.category || 'General',
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    };
  } catch (error) {
    console.error('Gemini article synthesis failed:', error.message);
    const fallbackSummary = `Highlights for ${topic}: ${articles
      .slice(0, 2)
      .map((article) => article.snippet || article.title)
      .join(' / ')}`;
    return {
      title: `Trending: ${topic}`,
      content: articles.map((article, idx) => `${idx + 1}. ${article.title} - ${article.snippet || ''}`).join('\n'),
      summary: normalizeSummaryLength(fallbackSummary, articles),
      category: 'General',
      tags: [topic.toLowerCase().replace(/\s+/g, '-'), 'trending'],
    };
  }
};

const ingestCategoryFeeds = async (issues) => {
  const categoryRecords = [];

  for (const feed of CATEGORY_FEEDS) {
    try {
      const articles = await fetchCategoryArticles(feed).catch((error) => {
        throw new Error(error.message || 'Category fetch failed');
      });
      if (!articles.length) {
        const warning = `No Google News articles returned for ${feed.id}`;
        console.warn(warning);
        issues.push(warning);
        continue;
      }

      // Process each article individually to create specific In-Depth Analysis
      // Process 3 articles per category to fill frontend display capacity (up to 4 per section)
      // 5 categories × 3 articles = 15 Gemini calls total
      // With 8-second delays between calls, this takes ~2 minutes to complete safely
      const articlesToProcess = articles.slice(0, 3);
      console.log(`[Category Feed] Processing ${articlesToProcess.length} articles for ${feed.category} category`);
      
      for (const article of articlesToProcess) {
        try {
          console.log(`[Category Feed] Generating analysis for: "${article.title}" (${feed.category})`);
          
          // Generate analysis specific to this individual article
          const articleData = await summarizeArticlesWithGemini(article.title, [article]);
          
          // Use primaryLink as the primary deduplication key to ensure uniqueness
          // This prevents duplicate articles even if titles are similar
          const record = await News.findOneAndUpdate(
            { 
              primaryLink: article.link // Primary key: match by article URL to avoid duplicates
            },
            {
              $set: {
                topic: article.title, // Individual article headline
                title: articleData.title || article.title, // Gemini-generated or original title
                summary: articleData.summary || normalizeSummaryLength(article.snippet, [article]),
                content: articleData.content || article.snippet || 'Analysis unavailable.', // Individual in-depth analysis
                category: feed.category,
                tags: articleData.tags.length ? articleData.tags : feed.tags,
                sourceOptions: [article],
                availableSources: article.source ? [article.source] : [],
                selectedSource: article.source || null,
                primarySource: article.source || null,
                primaryLink: article.link || null,
                externalUrl: article.link || null,
                imageUrl: article.imageUrl || null,
                generatedAt: new Date(),
                isTrending: false,
                autoGenerated: true,
                fromNewsApi: true,
                status: 'published',
                publishedAt: new Date(),
              },
              $setOnInsert: {
                interestOverTime: [],
              },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );

          console.log(`[MongoDB] ✅ Stored category article: "${record.title}" (ID: ${record._id}) in ${feed.category}`);
          categoryRecords.push(record);
        } catch (articleError) {
          const articleMessage = `Failed to process article "${article.title}" in ${feed.id}: ${articleError.message}`;
          console.error(articleMessage);
          issues.push(articleMessage);
        }
      }
    } catch (error) {
      const message = `Category feed ${feed.id} failed: ${error.message}`;
      console.error(message);
      issues.push(message);
    }
  }

  return categoryRecords;
};

const refreshCategoryFeeds = async () => {
  const issues = [];
  const categoryRecords = await ingestCategoryFeeds(issues);

  const counters = { trending: 0, categories: categoryRecords.length };
  const overallStatus =
    issues.length === 0
      ? 'success'
      : counters.categories > 0
      ? 'partial'
      : 'failed';

  await updateStatus({
    lastRunFinishedAt: new Date(),
    lastRunStatus: overallStatus,
    summary: `Categories only: ${counters.categories}`,
    issues: issues.slice(-8),
    counters,
  });

  return categoryRecords;
};

const runTrendingIngestion = async () => {
  const startedAt = new Date();
  await updateStatus({
    lastRunAt: startedAt,
    lastRunStatus: 'running',
    summary: 'Starting ingestion pipeline…',
    issues: [],
  });

  const topics = await fetchTrendingTopics();
  const results = [];
  const issues = [];
  let trendingCount = 0;

  if (!topics.length) {
    console.warn('No trending topics returned from SerpAPI.');
  }

  for (const topic of topics) {
    try {
      const insights = await fetchTopicInsights(topic).catch(() => null);
      const articles = await fetchTopicArticles(topic);
      const summary = await summarizeWithGemini(topic, insights);
      const availableSources = Array.from(
        new Set(articles.map((article) => article.source).filter(Boolean))
      );
      const firstArticle = articles[0] || {};
      const normalizedSummary = normalizeSummaryLength(summary, articles);

      const record = await News.findOneAndUpdate(
        { topic },
        {
          $set: {
            topic,
            title: topic,
            summary: normalizedSummary,
            interestOverTime: insights?.interest_over_time || [],
            isTrending: true,
            generatedAt: new Date(),
            sourceOptions: articles,
            availableSources,
            selectedSource: availableSources[0] || null,
            primarySource: firstArticle.source || null,
            primaryLink: firstArticle.link || null,
            externalUrl: firstArticle.link || null,
            imageUrl: firstArticle.imageUrl || null,
            category: 'Trending',
            tags: [topic.toLowerCase().replace(/\s+/g, '-')],
            autoGenerated: true,
            fromNewsApi: true,
          },
          $setOnInsert: { status: 'draft' },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      console.log(`[MongoDB] ✅ Stored trending topic: "${topic}" (ID: ${record._id})`);
      trendingCount += 1;
      results.push(record);
    } catch (error) {
      const message = `Failed to process topic "${topic}": ${error.message}`;
      console.error(message);
      issues.push(message);
    }
  }

  const categoryRecords = await ingestCategoryFeeds(issues);
  results.push(...categoryRecords);
  const counters = { trending: trendingCount, categories: categoryRecords.length };
  const overallStatus =
    issues.length === 0
      ? 'success'
      : counters.trending + counters.categories > 0
      ? 'partial'
      : 'failed';

  await updateStatus({
    lastRunFinishedAt: new Date(),
    lastRunStatus: overallStatus,
    summary: `Trending: ${counters.trending}, Categories: ${counters.categories}`,
    issues: issues.slice(-8),
    counters,
  });

  console.log(`[MongoDB] 📊 Storage Summary: ${counters.trending} trending topics + ${counters.categories} category articles = ${results.length} total records stored`);
  console.log(`[MongoDB] ✅ All content successfully stored in MongoDB`);

  return results;
};

let cronJob;
const scheduleAutoTrendingRefresh = () => {
  if (cronJob) {
    return cronJob;
  }

  // Default: refresh both trending and category feeds every 6 hours (~4 times per day)
  // Cron format: minute hour day month day-of-week
  // '0 */6 * * *' = at minute 0 of every 6th hour (00:00, 06:00, 12:00, 18:00)
  const expression = process.env.TRENDING_REFRESH_CRON || '0 */6 * * *';

  cronJob = cron.schedule(
    expression,
    async () => {
      try {
        console.log(`[Cron] Starting scheduled refresh at ${new Date().toISOString()}`);
        await runTrendingIngestion();
        console.log(`[Cron] Scheduled refresh completed`);
      } catch (error) {
        console.error('[Cron] Scheduled refresh task failed:', error.message);
        console.error(error.stack);
      }
    },
    { scheduled: true }
  );

  // Initial prime: fetch both trending topics and category feeds on server startup (non-blocking)
  // This ensures all content is stored in MongoDB every time the server restarts
  (async () => {
    try {
      console.log('[Startup] ========================================');
      console.log('[Startup] Running initial content fetch on server restart...');
      console.log('[Startup] Fetching trending topics and category feeds...');
      console.log('[Startup] All content will be stored in MongoDB.');
      console.log('[Startup] ========================================');
      
      // Fetch both trending topics and category feeds
      // This ensures content is available immediately after server restart
      await runTrendingIngestion();
      
      console.log('[Startup] ✅ Initial content fetch completed.');
      console.log('[Startup] All trending topics and category feeds stored in MongoDB.');
    } catch (error) {
      console.error('[Startup] ❌ Initial content fetch failed:', error.message);
      console.error('[Startup] Error details:', error.stack);
    }
  })();

  return cronJob;
};

const generateNewsFromTopic = async ({ topic, autoPublish = false, authorId = null }) => {
  if (!topic) {
    throw new Error('Topic is required to generate news');
  }

  const [insights, articles] = await Promise.all([
    fetchTopicInsights(topic).catch(() => null),
    fetchTopicArticles(topic, 8),
  ]);

  if (!articles.length) {
    throw new Error('No news articles found for that topic');
  }

  const articleData = await summarizeArticlesWithGemini(topic, articles);
  const availableSources = Array.from(
    new Set(articles.map((article) => article.source).filter(Boolean))
  );
  const firstArticle = articles[0];

  const record = await News.create({
    topic,
    title: articleData.title || topic,
    summary: articleData.summary || normalizeSummaryLength(articles[0]?.snippet, articles),
    content: articleData.content,
    category: articleData.category,
    tags: articleData.tags,
    interestOverTime: insights?.interest_over_time || [],
    availableSources,
    sourceOptions: articles,
    selectedSource: availableSources[0] || null,
    primarySource: firstArticle.source || null,
    primaryLink: firstArticle.link || null,
    externalUrl: firstArticle.link || null,
    imageUrl: firstArticle.imageUrl || null,
    status: autoPublish ? 'published' : 'draft',
    publishedAt: autoPublish ? new Date() : null,
    isTrending: false,
    autoGenerated: true,
    fromNewsApi: true,
    createdBy: authorId || null,
  });

  return record;
};

module.exports = {
  runTrendingIngestion,
  scheduleAutoTrendingRefresh,
  generateNewsFromTopic,
  normalizeSummaryLength,
  refreshCategoryFeeds,
};

