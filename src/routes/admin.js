const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const {
  getAllUsers,
  createUser,
  suspendUser,
  deleteUser,
  getGoalSheets,
  unlockGoalSheet,
  getAuditLogs,
  createCycle,
  getEscalationRules,
  updateEscalationRule,
  getEscalationLogs,
} = require('../controllers/adminController');

router.get('/users', authenticate, authorize('ADMIN'), getAllUsers);
router.post('/users', authenticate, authorize('ADMIN'), createUser);
router.patch('/users/:userId/suspend', authenticate, authorize('ADMIN'), suspendUser);
router.delete('/users/:userId', authenticate, authorize('ADMIN'), deleteUser);

router.get('/goal-sheets', authenticate, authorize('ADMIN'), getGoalSheets);
router.post('/unlock/:sheetId', authenticate, authorize('ADMIN'), unlockGoalSheet);

router.get('/audit-logs', authenticate, authorize('ADMIN'), getAuditLogs);

router.post('/cycles', authenticate, authorize('ADMIN'), createCycle);

router.get('/escalation-rules', authenticate, authorize('ADMIN'), getEscalationRules);
router.put('/escalation-rules/:ruleId', authenticate, authorize('ADMIN'), updateEscalationRule);
router.get('/escalation-logs', authenticate, authorize('ADMIN'), getEscalationLogs);

module.exports = router;