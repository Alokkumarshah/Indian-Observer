const router = require('express').Router();
const { forceRefreshTrending, listTrending, getTrendingStatus } = require('../controllers/trendingController');
const { requireAuth } = require('../middleware/auth');

router.get('/', listTrending);
router.get('/status', getTrendingStatus);
router.post('/refresh', requireAuth('admin'), forceRefreshTrending);

module.exports = router;

