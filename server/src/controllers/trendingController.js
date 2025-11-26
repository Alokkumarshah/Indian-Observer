const News = require('../models/News');
const { runTrendingIngestion } = require('../services/trendingService');

const forceRefreshTrending = async (req, res) => {
  try {
    const results = await runTrendingIngestion();
    res.json({ refreshed: results.length, items: results });
  } catch (error) {
    res.status(500).json({ message: 'Trending refresh failed', error: error.message });
  }
};

const listTrending = async (req, res) => {
  const news = await News.find({ isTrending: true }).sort({ generatedAt: -1 });
  res.json(news);
};

module.exports = { forceRefreshTrending, listTrending };

