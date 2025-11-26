const router = require('express').Router();
const { forceRefreshTrending, listTrending } = require('../controllers/trendingController');
const { requireAuth } = require('../middleware/auth');

router.get('/', listTrending);
router.post('/refresh', requireAuth('admin'), forceRefreshTrending);

module.exports = router;

