const pool = require('../config/db');
const { logAudit } = require('../middleware/auditLogger');
const { sendEmail, emailTemplates } = require('../config/email');

const getAllUsers = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.department, u.manager_id,
              m.name AS manager_name, u.created_at,
              COALESCE(u.is_suspended, FALSE) AS is_suspended
       FROM users u
       LEFT JOIN users m ON u.manager_id = m.id
       ORDER BY u.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

const createUser = async (req, res) => {
  const bcrypt = require('bcryptjs');
  const { name, email, password, role, department, managerId } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ message: 'name, email, password, role are required' });
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    const hash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, department, manager_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, email, role, department, manager_id, created_at`,
      [name, email.toLowerCase().trim(), hash, role, department || null, managerId || null]
    );

    await logAudit({
      tableName: 'users',
      recordId: result.rows[0].id,
      action: 'CREATE',
      changedBy: req.user.id,
      newValues: result.rows[0],
    });

    try {
      const tpl = emailTemplates.userAdded(name, email, password, role);
      await sendEmail({ to: email, ...tpl });
    } catch (emailErr) {
      console.error('Failed to send welcome email:', emailErr.message);
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getGoalSheets = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT gs.*, u.name AS employee_name, u.email AS employee_email, u.department,
              c.cycle_name, c.phase
       FROM goal_sheets gs
       JOIN users u ON gs.employee_id = u.id
       JOIN goal_cycles c ON gs.cycle_id = c.id
       ORDER BY gs.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

const unlockGoalSheet = async (req, res) => {
  const { sheetId } = req.params;

  try {
    const oldSheetRes = await pool.query('SELECT * FROM goal_sheets WHERE id = $1', [sheetId]);
    if (!oldSheetRes.rows.length) {
      return res.status(404).json({ message: 'Goal sheet not found' });
    }

    const oldSheet = oldSheetRes.rows[0];

    await pool.query(
      `UPDATE goal_sheets
       SET is_locked = FALSE, status = 'RETURNED'
       WHERE id = $1`,
      [sheetId]
    );

    // Email the employee and create a notification
    try {
      const empRes = await pool.query(
        `SELECT u.name, u.email, u.id AS employee_id
         FROM goal_sheets gs JOIN users u ON gs.employee_id = u.id
         WHERE gs.id = $1`,
        [sheetId]
      );
      const emp = empRes.rows[0];
      if (emp) {
        const tpl = emailTemplates.goalUnlockedByAdmin(emp.name);
        await sendEmail({ to: emp.email, ...tpl });
        await pool.query(
          `INSERT INTO notifications (user_id, type, message, related_id)
           VALUES ($1, 'GOAL_RETURNED', $2, $3)`,
          [emp.employee_id, 'Your goal sheet has been unlocked by Admin/HR. You can now edit and re-submit.', sheetId]
        );
      }
    } catch (emailErr) {
      console.error('Admin unlock email failed (non-fatal):', emailErr.message);
    }

    await logAudit({
      tableName: 'goal_sheets',
      recordId: sheetId,
      action: 'UNLOCK',
      changedBy: req.user.id,
      oldValues: oldSheet,
      newValues: { is_locked: false, status: 'RETURNED' },
    });

    res.json({ message: 'Goal sheet unlocked successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

const getAuditLogs = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const rangeEnd = endDate || startDate || null;
    const clauses = [];
    const values = [];

    if (startDate) {
      values.push(startDate);
      clauses.push(`(a.changed_at AT TIME ZONE 'Asia/Kolkata')::date >= $${values.length}`);
    }

    if (rangeEnd) {
      values.push(rangeEnd);
      clauses.push(`(a.changed_at AT TIME ZONE 'Asia/Kolkata')::date <= $${values.length}`);
    }

    const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT a.*, u.name AS changed_by_name, u.email AS changed_by_email, u.role AS changed_by_role
       FROM audit_logs a
       LEFT JOIN users u ON a.changed_by = u.id
       ${whereSql}
       ORDER BY a.changed_at DESC
       LIMIT 200`,
      values
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

const createCycle = async (req, res) => {
  const { cycleName, windows, isActive } = req.body;

  if (!cycleName || !Array.isArray(windows) || windows.length === 0) {
    return res.status(400).json({ message: 'Cycle name and windows are required' });
  }

  const requiredPhases = ['GOAL_SETTING', 'Q1', 'Q2', 'Q3', 'Q4'];
  const phaseSet = new Set(windows.map((w) => w.phase));
  const missing = requiredPhases.filter((p) => !phaseSet.has(p));

  if (missing.length) {
    return res.status(400).json({ message: `Missing windows for phases: ${missing.join(', ')}` });
  }

  const goalSettingWindow = windows.find((w) => w.phase === 'GOAL_SETTING');
  if (!goalSettingWindow?.windowOpen || !goalSettingWindow?.windowClose) {
    return res.status(400).json({ message: 'GOAL_SETTING window dates are required' });
  }

  try {
    if (isActive) {
      await pool.query('UPDATE goal_cycles SET is_active = FALSE');
    }

    // Keep legacy fields populated with GOAL_SETTING window to satisfy DB constraints.
    const result = await pool.query(
      `INSERT INTO goal_cycles (cycle_name, phase, window_open, window_close, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        cycleName,
        'GOAL_SETTING',
        goalSettingWindow.windowOpen,
        goalSettingWindow.windowClose,
        isActive || false,
        req.user.id
      ]
    );

    const cycleId = result.rows[0].id;
    const insertPromises = windows.map((w) =>
      pool.query(
        `INSERT INTO goal_cycle_windows (cycle_id, phase, window_open, window_close)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (cycle_id, phase)
         DO UPDATE SET window_open = EXCLUDED.window_open, window_close = EXCLUDED.window_close`,
        [cycleId, w.phase, w.windowOpen, w.windowClose]
      )
    );

    await Promise.all(insertPromises);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

const getEscalationRules = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM escalation_rules ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

const updateEscalationRule = async (req, res) => {
  const { ruleId } = req.params;
  const { daysThreshold, notifyEmployee, notifyManager, notifyHr, isActive } = req.body;

  try {
    const result = await pool.query(
      `UPDATE escalation_rules
       SET days_threshold = COALESCE($1, days_threshold),
           notify_employee = COALESCE($2, notify_employee),
           notify_manager = COALESCE($3, notify_manager),
           notify_hr = COALESCE($4, notify_hr),
           is_active = COALESCE($5, is_active)
       WHERE id = $6
       RETURNING *`,
      [daysThreshold, notifyEmployee, notifyManager, notifyHr, isActive, ruleId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: 'Rule not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

const getEscalationLogs = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT el.*, u.name AS employee_name, u.email AS employee_email, er.rule_name
       FROM escalation_logs el
       LEFT JOIN users u ON el.triggered_for = u.id
       LEFT JOIN escalation_rules er ON el.rule_id = er.id
       ORDER BY el.triggered_at DESC
       LIMIT 200`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

const suspendUser = async (req, res) => {
  const { userId } = req.params;
  if (String(userId) === String(req.user.id)) {
    return res.status(400).json({ message: 'You cannot suspend your own account.' });
  }
  try {
    const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (!userRes.rows.length) return res.status(404).json({ message: 'User not found' });
    const user = userRes.rows[0];
    const newSuspended = !user.is_suspended;

    await pool.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT FALSE`
    );

    const result = await pool.query(
      `UPDATE users SET is_suspended = $1 WHERE id = $2 RETURNING id, name, email, role, is_suspended`,
      [newSuspended, userId]
    );

    await logAudit({
      tableName: 'users',
      recordId: userId,
      action: newSuspended ? 'SUSPEND' : 'UNSUSPEND',
      changedBy: req.user.id,
      oldValues: { is_suspended: user.is_suspended },
      newValues: { is_suspended: newSuspended },
    });

    try {
      const tpl = emailTemplates.userSuspendedStatus(user.name, newSuspended);
      await sendEmail({ to: user.email, ...tpl });
    } catch (emailErr) {
      console.error('Failed to send user suspension email:', emailErr.message);
    }

    res.json({ message: newSuspended ? 'User suspended.' : 'User reinstated.', user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const deleteUser = async (req, res) => {
  const { userId } = req.params;
  if (String(userId) === String(req.user.id)) {
    return res.status(400).json({ message: 'You cannot delete your own account.' });
  }
  try {
    const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (!userRes.rows.length) return res.status(404).json({ message: 'User not found' });
    const user = userRes.rows[0];

    if (user.role === 'ADMIN') {
      const adminCount = await pool.query(`SELECT COUNT(*) FROM users WHERE role = 'ADMIN'`);
      if (parseInt(adminCount.rows[0].count) <= 1) {
        return res.status(400).json({ message: 'Cannot delete the last admin account.' });
      }
    }

    await pool.query('DELETE FROM users WHERE id = $1', [userId]);

    await logAudit({
      tableName: 'users',
      recordId: userId,
      action: 'DELETE',
      changedBy: req.user.id,
      oldValues: user,
      newValues: null,
    });

    try {
      const tpl = emailTemplates.userDeleted(user.name);
      await sendEmail({ to: user.email, ...tpl });
    } catch (emailErr) {
      console.error('Failed to send user deletion email:', emailErr.message);
    }

    res.json({ message: `User "${user.name}" removed successfully.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
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
};