const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const {
  getTeamSheets,
  getSheetDetails,
  managerEditGoal,
  approveSheet,
  returnSheet,
  getTeamCheckins,
  addCheckinComment,
  pushGoalToTeam,
  getSharedGoals,
  approveModification,
  rejectModification
} = require('../controllers/managerController');

router.get('/team-sheets', authenticate, authorize('MANAGER', 'ADMIN'), getTeamSheets);
router.get('/sheet/:sheetId', authenticate, authorize('MANAGER', 'ADMIN'), getSheetDetails);
router.put('/goal/:goalId', authenticate, authorize('MANAGER', 'ADMIN'), managerEditGoal);
router.post('/goal/push', authenticate, authorize('MANAGER', 'ADMIN'), pushGoalToTeam);
router.post('/approve/:sheetId', authenticate, authorize('MANAGER', 'ADMIN'), approveSheet);
router.post('/return/:sheetId', authenticate, authorize('MANAGER', 'ADMIN'), returnSheet);
router.post('/approve-modification/:sheetId', authenticate, authorize('MANAGER', 'ADMIN'), approveModification);
router.post('/reject-modification/:sheetId', authenticate, authorize('MANAGER', 'ADMIN'), rejectModification);
router.get('/checkins/:sheetId', authenticate, authorize('MANAGER', 'ADMIN'), getTeamCheckins);
router.post('/checkin-comment', authenticate, authorize('MANAGER', 'ADMIN'), addCheckinComment);
router.get('/shared-goals', authenticate, authorize('MANAGER', 'ADMIN'), getSharedGoals);

module.exports = router;