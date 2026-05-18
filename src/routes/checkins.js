const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { upsertCheckin, getMyProgress } = require('../controllers/checkinController');

router.post('/', authenticate, authorize('EMPLOYEE'), upsertCheckin);
router.get('/my-progress', authenticate, authorize('EMPLOYEE'), getMyProgress);

module.exports = router;