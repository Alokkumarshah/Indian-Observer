const axios = require('axios');
const cron = require('node-cron');
const { getJson } = require('serpapi');
const News = require('../models/News');

const GEMINI_MODEL = 'gemini-1.5-flash-latest';
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

const serpRequest = (params) => {
  if (!process.env.SERPAPI_KEY) {
    throw new Error('SERPAPI_KEY missing');
  }

  return new Promise((resolve, reject) => {
    getJson({ api_key: process.env.SERPAPI_KEY, ...params }, (json) => {
      if (json.error) {
        return reject(new Error(json.error));
      }
      resolve(json);
    });
  });
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

const callGemini = async (prompt) => {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error('GOOGLE_API_KEY missing');
  }

  const { data } = await axios.post(
    `${GEMINI_ENDPOINT}/${GEMINI_MODEL}:generateContent?key=${process.env.GOOGLE_API_KEY}`,
    { contents: [{ parts: [{ text: prompt }] }] }
  );

  return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
};

const summarizeWithGemini = async (topic, trendData) => {
  const trendSlice = JSON.stringify(trendData?.interest_over_time || []).slice(0, 6000);

  const prompt = [
    'Create a crisp, factual news brief (max 80 words) for the following trending Indian topic.',
    `Topic: ${topic}`,
    `Trend data: ${trendSlice}`,
    'Highlight why it matters and avoid speculation.',
  ].join('\n');

  const responseText = await callGemini(prompt);
  return responseText || 'Summary unavailable.';
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
    return {
      title: parsed.title || topic,
      content: parsed.content || parsed.summary || 'Content unavailable.',
      summary: parsed.summary || parsed.content?.slice(0, 200) || 'Summary unavailable.',
      category: parsed.category || 'General',
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    };
  } catch (error) {
    console.error('Gemini article synthesis failed:', error.message);
    return {
      title: `Trending: ${topic}`,
      content: articles.map((article, idx) => `${idx + 1}. ${article.title} - ${article.snippet || ''}`).join('\n'),
      summary: `Highlights for ${topic}: ${articles
        .slice(0, 2)
        .map((article) => article.snippet || article.title)
        .join(' / ')}`,
      category: 'General',
      tags: [topic.toLowerCase().replace(/\s+/g, '-'), 'trending'],
    };
  }
};

const runTrendingIngestion = async () => {
  const topics = await fetchTrendingTopics();
  if (!topics.length) {
    console.warn('No trending topics returned from SerpAPI.');
    return [];
  }
  const results = [];

  for (const topic of topics) {
    try {
      const insights = await fetchTopicInsights(topic).catch(() => null);
      const articles = await fetchTopicArticles(topic).catch(() => []);
      const summary = await summarizeWithGemini(topic, insights);
      const availableSources = Array.from(
        new Set(articles.map((article) => article.source).filter(Boolean))
      );
      const firstArticle = articles[0] || {};

      const record = await News.findOneAndUpdate(
        { topic },
        {
          $set: {
            topic,
            title: topic,
            summary,
            interestOverTime: insights.interest_over_time || [],
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

      results.push(record);
    } catch (error) {
      console.error('Failed to process topic', topic, error.message);
    }
  }

  return results;
};

let cronJob;
const scheduleAutoTrendingRefresh = () => {
  if (cronJob) {
    return cronJob;
  }

  const expression = process.env.TRENDING_REFRESH_CRON || '*/30 * * * *';

  cronJob = cron.schedule(
    expression,
    async () => {
      try {
        await runTrendingIngestion();
      } catch (error) {
        console.error('Trending refresh task failed:', error.message);
      }
    },
    { scheduled: true }
  );

  runTrendingIngestion().catch((error) => {
    console.error('Initial trending pull failed:', error.message);
  });

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
    summary: articleData.summary || articles[0].snippet || 'Summary unavailable.',
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

module.exports = { runTrendingIngestion, scheduleAutoTrendingRefresh, generateNewsFromTopic };

