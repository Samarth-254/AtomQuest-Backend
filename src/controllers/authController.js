const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../config/db');
const { logAudit } = require('../middleware/auditLogger');
const { sendEmail, emailTemplates } = require('../config/email');
require('dotenv').config();

const ensurePasswordResetTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ
    )
  `);
};

const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ message: 'Email and password are required' });

  try {
    const result = await pool.query(
      'SELECT id, name, email, password_hash, role, manager_id, department, COALESCE(is_suspended, FALSE) as is_suspended FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0)
      return res.status(401).json({ message: 'Invalid email or password' });

    const user = result.rows[0];
    
    if (user.is_suspended) {
      return res.status(403).json({ message: 'Your account has been suspended. Please contact the administrator.' });
    }
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch)
      return res.status(401).json({ message: 'Invalid email or password' });

    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        managerId: user.manager_id,
        department: user.department,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    await logAudit({
      tableName: 'users',
      recordId: user.id,
      action: 'LOGIN',
      changedBy: user.id,
      newValues: { email: user.email, role: user.role }
    });

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getMe = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.department,
              m.name AS manager_name, m.email AS manager_email
       FROM users u
       LEFT JOIN users m ON u.manager_id = m.id
       WHERE u.id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ message: 'User not found' });

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

const seedPasswords = async (req, res) => {
  try {
    const password = 'password123';
    const hash = await bcrypt.hash(password, 10);

    await pool.query(`UPDATE users SET password_hash = $1`, [hash]);
    res.json({ message: 'All demo user passwords set to: password123' });
  } catch (err) {
    res.status(500).json({ message: 'Seed failed', error: err.message });
  }
};

const requestPasswordReset = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  try {
    await ensurePasswordResetTable();

    const result = await pool.query(
      'SELECT id, name, email FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Email not found' });
    }

    const user = result.rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await pool.query('DELETE FROM password_resets WHERE user_id = $1', [user.id]);
    await pool.query(
      'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, tokenHash, expiresAt]
    );

    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${token}&email=${encodeURIComponent(user.email)}`;
    const template = emailTemplates.passwordReset(user.name || 'there', resetLink);
    await sendEmail({
      to: user.email,
      toName: user.name,
      subject: template.subject,
      html: template.html,
      tags: ['password-reset'],
    });

    return res.json({ message: 'Password reset link sent' });
  } catch (err) {
    console.error('Password reset request error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

const resetPassword = async (req, res) => {
  const { email, token, newPassword } = req.body;

  if (!email || !token || !newPassword) {
    return res.status(400).json({ message: 'Email, token, and new password are required' });
  }

  try {
    await ensurePasswordResetTable();

    const userResult = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'Email not found' });
    }

    const userId = userResult.rows[0].id;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const resetResult = await pool.query(
      `SELECT id FROM password_resets
       WHERE user_id = $1 AND token_hash = $2 AND used_at IS NULL AND expires_at > NOW()
       ORDER BY id DESC LIMIT 1`,
      [userId, tokenHash]
    );

    if (resetResult.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);
    await pool.query('UPDATE password_resets SET used_at = NOW() WHERE id = $1', [resetResult.rows[0].id]);

    return res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  login,
  getMe,
  seedPasswords,
  requestPasswordReset,
  resetPassword,
};