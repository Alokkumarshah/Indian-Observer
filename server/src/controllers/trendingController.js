const News = require('../models/News');
const SystemStatus = require('../models/SystemStatus');
const { runTrendingIngestion, refreshCategoryFeeds } = require('../services/trendingService');

const forceRefreshTrending = async (req, res) => {
  try {
    const results = await runTrendingIngestion();
    const status = await SystemStatus.findOne({ key: 'ingestion' }).lean();
    res.json({ refreshed: results.length, items: results, status });
  } catch (error) {
    res.status(500).json({ message: 'Trending refresh failed', error: error.message });
  }
};

const listTrending = async (req, res) => {
  try {
    const news = await News.find({ isTrending: true })
      .sort({ generatedAt: -1, publishedAt: -1, createdAt: -1 })
      .lean();
    
    console.log(`[listTrending] Found ${news.length} trending articles`);
    res.json(news);
  } catch (error) {
    console.error('[listTrending] Error:', error);
    res.status(500).json({ message: 'Failed to fetch trending news', error: error.message });
  }
};

const getTrendingStatus = async (req, res) => {
  const status =
    (await SystemStatus.findOne({ key: 'ingestion' }).lean()) || {
      lastRunStatus: 'idle',
    };
  res.json(status);
};

const refreshCategoriesOnly = async (req, res) => {
  try {
    const items = await refreshCategoryFeeds();
    res.json({ refreshed: items.length, items });
  } catch (error) {
    res.status(500).json({ message: 'Category refresh failed', error: error.message });
  }
};

module.exports = { forceRefreshTrending, listTrending, getTrendingStatus, refreshCategoriesOnly };

