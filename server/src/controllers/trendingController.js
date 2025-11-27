const News = require('../models/News');
const SystemStatus = require('../models/SystemStatus');
const { runTrendingIngestion } = require('../services/trendingService');

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
  const news = await News.find({ isTrending: true }).sort({ generatedAt: -1 });
  res.json(news);
};

const getTrendingStatus = async (req, res) => {
  const status =
    (await SystemStatus.findOne({ key: 'ingestion' }).lean()) || {
      lastRunStatus: 'idle',
    };
  res.json(status);
};

module.exports = { forceRefreshTrending, listTrending, getTrendingStatus };

