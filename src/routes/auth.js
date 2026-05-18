const express = require('express');
const router = express.Router();
const { login, getMe, seedPasswords, requestPasswordReset, resetPassword } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

router.post('/login', login);
router.get('/me', authenticate, getMe);
router.post('/seed-passwords', seedPasswords);
router.post('/forgot-password', requestPasswordReset);
router.post('/reset-password', resetPassword);

module.exports = router;