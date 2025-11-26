const News = require('../models/News');
const { generateNewsFromTopic } = require('../services/trendingService');

const getPublishedNews = async (req, res) => {
  const news = await News.find({ status: 'published' })
    .sort({ publishedAt: -1 })
    .populate('comments.user', 'name role');
  res.json(news);
};

const getDraftNews = async (req, res) => {
  const drafts = await News.find({ status: 'draft' }).sort({ createdAt: -1 });
  res.json(drafts);
};

const publishNews = async (req, res) => {
  const news = await News.findById(req.params.id);
  if (!news) {
    return res.status(404).json({ message: 'News not found' });
  }

  news.status = 'published';
  news.publishedAt = new Date();
  await news.save();
  res.json(news);
};

const addComment = async (req, res) => {
  const news = await News.findById(req.params.id);
  if (!news || news.status !== 'published') {
    return res.status(404).json({ message: 'News not found' });
  }

  news.comments.push({ user: req.user.id, text: req.body.text });
  await news.save();

  await news.populate('comments.user', 'name role');
  res.status(201).json(news.comments.at(-1));
};

const deleteNews = async (req, res) => {
  const news = await News.findByIdAndDelete(req.params.id);
  if (!news) {
    return res.status(404).json({ message: 'News not found' });
  }
  res.json({ message: 'News removed' });
};

const generateNews = async (req, res) => {
  try {
    const { topic, autoPublish = false } = req.body;
    if (!topic) {
      return res.status(400).json({ message: 'Topic is required' });
    }

    const article = await generateNewsFromTopic({
      topic,
      autoPublish: Boolean(autoPublish),
      authorId: req.user?.id || null,
    });

    res.status(201).json({
      message: autoPublish ? 'News published to feed' : 'Draft ready for review',
      article,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to generate news', error: error.message });
  }
};

module.exports = {
  getPublishedNews,
  getDraftNews,
  publishNews,
  addComment,
  deleteNews,
  generateNews,
};

