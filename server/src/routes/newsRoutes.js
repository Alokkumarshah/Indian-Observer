const router = require('express').Router();
const {
  getPublishedNews,
  getDraftNews,
  publishNews,
  addComment,
  deleteNews,
  generateNews,
} = require('../controllers/newsController');
const { requireAuth } = require('../middleware/auth');

router.get('/', getPublishedNews);
router.get('/drafts', requireAuth('admin'), getDraftNews);
router.post('/generate', requireAuth('admin'), generateNews);
router.patch('/:id/publish', requireAuth('admin'), publishNews);
router.delete('/:id', requireAuth('admin'), deleteNews);
router.post('/:id/comments', requireAuth(), addComment);

module.exports = router;

