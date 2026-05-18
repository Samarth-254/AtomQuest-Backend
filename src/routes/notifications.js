const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const pool = require('../config/db');

// GET /api/notifications — fetch unread notifications for logged-in user
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, type, message, is_read, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 30`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('notifications fetch error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PATCH /api/notifications/:id/read — mark one as read
router.patch('/:id/read', authenticate, async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    res.json({ message: 'Marked as read' });
  } catch (err) {
    console.error('notification mark-read error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PATCH /api/notifications/read-all — mark all as read
router.patch('/read-all', authenticate, async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET is_read = TRUE WHERE user_id = $1`,
      [req.user.id]
    );
    res.json({ message: 'All marked as read' });
  } catch (err) {
    console.error('notification read-all error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
