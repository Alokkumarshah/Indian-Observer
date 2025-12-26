const axios = require('axios');
const cron = require('node-cron');
const { getJson } = require('serpapi');
const News = require('../models/News');
const SystemStatus = require('../models/SystemStatus');

const GEMINI_MODEL = 'gemini-robotics-er-1.5-preview';
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const SUMMARY_MIN_WORDS = 100;
const SUMMARY_MAX_WORDS = 140;

// Gemini rate limiting: ensure we stay well under 10 calls per minute
const GEMINI_MIN_INTERVAL_MS = 12500; // ~8–9 requests per minute
let lastGeminiCallAt = 0;

const delayIfNeededForGemini = async () => {
  const now = Date.now();
  const elapsed = now - lastGeminiCallAt;

  if (elapsed < GEMINI_MIN_INTERVAL_MS) {
    await new Promise((resolve) =>
      setTimeout(resolve, GEMINI_MIN_INTERVAL_MS - elapsed)
    );
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

const callGemini = async (prompt) => {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error('GOOGLE_API_KEY missing');
  }

  // Enforce global rate limit so we never exceed ~10 calls/min
  await delayIfNeededForGemini();

  // Check prompt length (Gemini 1.5 Flash supports up to ~1M tokens, but very long prompts may cause issues)
  const promptLength = prompt.length;
  if (promptLength > 1000000) {
    throw new Error(`Prompt too long: ${promptLength} characters (max ~1M tokens)`);
  }

  try {
    const { data } = await axios.post(
      `${GEMINI_ENDPOINT}/${GEMINI_MODEL}:generateContent?key=${process.env.GOOGLE_API_KEY}`,
      { contents: [{ parts: [{ text: prompt }] }] }
    );

    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  } catch (error) {
    // Log detailed error information for debugging
    if (error.response) {
      // HTTP error response from Gemini API
      const status = error.response.status;
      const errorData = error.response.data;
      const errorMessage = errorData?.error?.message || errorData?.message || error.message;
      
      console.error(`Gemini API error (${status}):`, {
        message: errorMessage,
        details: errorData?.error?.details || errorData,
        promptLength: promptLength,
        model: GEMINI_MODEL
      });
      
      // Throw a more descriptive error
      throw new Error(`Gemini API ${status}: ${errorMessage}`);
    } else if (error.request) {
      // Request was made but no response received
      console.error('Gemini API: No response received', {
        message: error.message,
        promptLength: promptLength
      });
      throw new Error(`Gemini API: No response - ${error.message}`);
    } else {
      // Error setting up the request
      console.error('Gemini API: Request setup error', error.message);
      throw error;
    }
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

// Helper function to attempt to fix common JSON issues
const tryFixJson = (jsonString) => {
  // Try to fix unescaped quotes in string values (basic attempt)
  // This is a simple heuristic and may not catch all cases
  try {
    // First, try parsing as-is
    return JSON.parse(jsonString);
  } catch (e) {
    // If parsing fails, try to fix common issues
    // Note: This is a best-effort fix and may not work for all malformed JSON
    console.warn('Attempting to fix malformed JSON...');
    // Return null to indicate fix failed - will fall back to error handling
    return null;
  }
};

const summarizeArticlesWithGemini = async (topic, articles) => {
  if (!Array.isArray(articles) || !articles.length) {
    throw new Error('No articles available to summarize');
  }

  // Limit snippet length to prevent extremely long prompts (max 2000 chars per snippet)
  const truncateSnippet = (text, maxLength = 2000) => {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  };

  const articlesText = articles
    .map((article, index) => {
      const safeSnippet = truncateSnippet(article.snippet || 'No synopsis available');
      const safeTitle = truncateSnippet(article.title || 'Untitled', 500);
      return `Article ${index + 1}:
Title: ${safeTitle}
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

  // Log prompt length for debugging
  if (prompt.length > 50000) {
    console.warn(`Warning: Very long prompt (${prompt.length} chars) for topic: ${topic}`);
  }

  try {
    const responseText = await callGemini(prompt);
    
    // Try to extract JSON from markdown code blocks first (```json ... ```)
    let jsonString = null;
    const codeBlockMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (codeBlockMatch) {
      jsonString = codeBlockMatch[1];
    } else {
      // Fallback to extracting JSON object directly
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonString = jsonMatch[0];
      }
    }
    
    if (!jsonString) {
      console.error('Gemini response missing JSON. Full response:', responseText.substring(0, 500));
      throw new Error('Gemini response missing JSON');
    }

    // Log the JSON string being parsed for debugging (truncated)
    if (jsonString.length > 1000) {
      console.log('Parsing JSON (truncated):', jsonString.substring(0, 1000) + '...');
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (parseError) {
      // Extract position from error message if available
      const positionMatch = parseError.message.match(/position (\d+)/);
      const errorPosition = positionMatch ? parseInt(positionMatch[1]) : null;
      
      console.error('JSON parse error:', parseError.message);
      console.error('JSON string length:', jsonString.length);
      console.error('JSON string (first 2000 chars):', jsonString.substring(0, 2000));
      
      if (errorPosition) {
        const start = Math.max(0, errorPosition - 200);
        const end = Math.min(jsonString.length, errorPosition + 200);
        console.error(`JSON string (around error position ${errorPosition}):`, jsonString.substring(start, end));
      }
      
      throw new Error(`Invalid JSON from Gemini: ${parseError.message}`);
    }
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
    return {
      title: topic,
      content: 'Article not generated',
      summary: 'Article not generated',
      category: 'General',
      tags: [],
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
      for (const article of articles.slice(0, 5)) {
        // Limit to 5 articles per category to avoid overwhelming Gemini API
        try {
          // Skip if article has no link (can't deduplicate without it)
          if (!article.link) {
            continue;
          }

          // Generate analysis specific to this individual article
          const articleData = await summarizeArticlesWithGemini(article.title, [article]);
          
          // Use primaryLink as the GLOBAL unique identifier to prevent duplicates across all categories
          // Normalize the link to handle URL variations (trailing slashes, query params, etc.)
          const normalizedLink = article.link?.split('?')[0]?.replace(/\/$/, '');
          
          // Check if article already exists by primaryLink (globally, not per category)
          const existingRecord = await News.findOne({
            $or: [
              { primaryLink: normalizedLink },
              { primaryLink: article.link },
              { externalUrl: normalizedLink },
              { externalUrl: article.link }
            ],
            autoGenerated: true,
            fromNewsApi: true
          });

          if (existingRecord) {
            // Article already exists - update it but don't create duplicate
            // Merge categories if different, update metadata
            const existingCategories = existingRecord.category ? [existingRecord.category] : [];
            const newCategory = feed.category;
            if (!existingCategories.includes(newCategory)) {
              existingCategories.push(newCategory);
            }
            
            // Update the existing record with latest data
            existingRecord.topic = article.title;
            existingRecord.title = articleData.title || article.title;
            existingRecord.summary = articleData.summary || normalizeSummaryLength(article.snippet, [article]);
            existingRecord.content = articleData.content || article.snippet || 'Analysis unavailable.';
            existingRecord.category = newCategory; // Use the most recent category
            existingRecord.tags = articleData.tags.length ? articleData.tags : feed.tags;
            existingRecord.sourceOptions = [article];
            existingRecord.availableSources = article.source ? [article.source] : [];
            existingRecord.selectedSource = article.source || null;
            existingRecord.primarySource = article.source || null;
            existingRecord.primaryLink = article.link;
            existingRecord.externalUrl = article.link;
            existingRecord.imageUrl = article.imageUrl || null;
            existingRecord.generatedAt = new Date();
            existingRecord.status = 'published';
            existingRecord.publishedAt = new Date();
            await existingRecord.save();
            
            categoryRecords.push(existingRecord);
            continue; // Skip creating a new record
          }
          
          // Article doesn't exist - create new record
          const record = await News.create({
            topic: article.title,
            title: articleData.title || article.title,
            summary: articleData.summary || normalizeSummaryLength(article.snippet, [article]),
            content: articleData.content || article.snippet || 'Analysis unavailable.',
            category: feed.category,
            tags: articleData.tags.length ? articleData.tags : feed.tags,
            sourceOptions: [article],
            availableSources: article.source ? [article.source] : [],
            selectedSource: article.source || null,
            primarySource: article.source || null,
            primaryLink: article.link,
            externalUrl: article.link,
            imageUrl: article.imageUrl || null,
            generatedAt: new Date(),
            isTrending: false,
            autoGenerated: true,
            fromNewsApi: true,
            status: 'published',
            publishedAt: new Date(),
            interestOverTime: [],
          });

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

  return results;
};

let cronJob;
const scheduleAutoTrendingRefresh = () => {
  if (cronJob) {
    return cronJob;
  }

  // Default: refresh section feeds every 6 hours (~4 times per day)
  // Cron format: minute hour day month day-of-week
  // '0 */6 * * *' = at minute 0 of every 6th hour (00:00, 06:00, 12:00, 18:00)
  const expression = process.env.TRENDING_REFRESH_CRON || '0 */6 * * *';

  cronJob = cron.schedule(
    expression,
    async () => {
      try {
        console.log(`[Cron] Starting scheduled category feed refresh at ${new Date().toISOString()}`);
        const results = await refreshCategoryFeeds();
        console.log(`[Cron] Category feed refresh completed: ${results.length} articles refreshed`);
      } catch (error) {
        console.error('[Cron] Section feed refresh task failed:', error.message);
        console.error(error.stack);
      }
    },
    { scheduled: true }
  );

  // Initial prime of category feeds (non-blocking)
  (async () => {
    try {
      console.log('[Cron] Running initial category feed refresh...');
      const results = await refreshCategoryFeeds();
      console.log(`[Cron] Initial refresh completed: ${results.length} articles refreshed`);
    } catch (error) {
      console.error('[Cron] Initial section feed refresh failed:', error.message);
      console.error(error.stack);
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

  // Check for existing article by topic or primaryLink to prevent duplicates
  const existingNews = await News.findOne({
    $or: [
      { topic },
      ...(firstArticle.link ? [{ primaryLink: firstArticle.link }] : [])
    ],
    autoGenerated: true,
    fromNewsApi: true
  });

  if (existingNews) {
    // Update existing record instead of creating duplicate
    existingNews.title = articleData.title || topic;
    existingNews.summary = articleData.summary || normalizeSummaryLength(articles[0]?.snippet, articles);
    existingNews.content = articleData.content;
    existingNews.category = articleData.category;
    existingNews.tags = articleData.tags;
    existingNews.interestOverTime = insights?.interest_over_time || [];
    existingNews.availableSources = availableSources;
    existingNews.sourceOptions = articles;
    existingNews.selectedSource = availableSources[0] || null;
    existingNews.primarySource = firstArticle.source || null;
    existingNews.primaryLink = firstArticle.link || null;
    existingNews.externalUrl = firstArticle.link || null;
    existingNews.imageUrl = firstArticle.imageUrl || null;
    existingNews.generatedAt = new Date();
    if (autoPublish) {
      existingNews.status = 'published';
      existingNews.publishedAt = new Date();
    }
    await existingNews.save();
    return existingNews;
  }

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

