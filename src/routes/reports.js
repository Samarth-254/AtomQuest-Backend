const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const {
  exportAchievementReport,
  exportCompletionReport,
} = require('../controllers/reportController');

router.get('/achievement-export', authenticate, authorize('ADMIN', 'MANAGER'), exportAchievementReport);
router.get('/completion-dashboard', authenticate, authorize('ADMIN', 'MANAGER'), exportCompletionReport);

module.exports = router;