const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const {
  getQoqTrends,
  getCompletionHeatmap,
  getGoalDistribution,
  getManagerEffectiveness,
  getLiveInsights,
} = require('../controllers/analyticsController');

router.get('/qoq-trends', authenticate, authorize('ADMIN', 'MANAGER'), getQoqTrends);
router.get('/completion-heatmap', authenticate, authorize('ADMIN', 'MANAGER'), getCompletionHeatmap);
router.get('/goal-distribution', authenticate, authorize('ADMIN', 'MANAGER'), getGoalDistribution);
router.get('/manager-effectiveness', authenticate, authorize('ADMIN', 'MANAGER'), getManagerEffectiveness);
router.get('/live-insights', authenticate, authorize('ADMIN', 'MANAGER'), getLiveInsights);

module.exports = router;