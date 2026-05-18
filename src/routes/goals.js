const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const {
  getMyGoalSheet,
  createGoalSheet,
  addGoal,
  updateGoal,
  deleteGoal,
  submitGoalSheet,
  requestModification,
  getThrustAreas,
  getCycles
} = require('../controllers/goalController');

router.get('/thrust-areas', authenticate, getThrustAreas);
router.get('/cycles', authenticate, getCycles);
router.get('/my-sheet', authenticate, authorize('EMPLOYEE'), getMyGoalSheet);
router.post('/sheet', authenticate, authorize('EMPLOYEE'), createGoalSheet);
router.post('/', authenticate, authorize('EMPLOYEE'), addGoal);
router.put('/:id', authenticate, authorize('EMPLOYEE'), updateGoal);
router.delete('/:id', authenticate, authorize('EMPLOYEE'), deleteGoal);
router.post('/submit/:sheetId', authenticate, authorize('EMPLOYEE'), submitGoalSheet);
router.post('/request-modification/:sheetId', authenticate, authorize('EMPLOYEE'), requestModification);

module.exports = router;