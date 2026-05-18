const pool = require('../config/db');
const { logAudit } = require('../middleware/auditLogger');
const { sendEmail, emailTemplates } = require('../config/email');

const getMyGoalSheet = async (req, res) => {
  const { cycleId } = req.query;
  const employeeId = req.user.id;

  try {
    const cycleRes = await pool.query(
      `SELECT * FROM goal_cycles WHERE ${cycleId ? 'id = $1' : 'is_active = TRUE'} LIMIT 1`,
      cycleId ? [cycleId] : []
    );

    if (!cycleRes.rows.length)
      return res.status(404).json({ message: 'No active cycle found' });

    const cycle = cycleRes.rows[0];

    const sheetRes = await pool.query(
      `SELECT gs.*, u.name AS employee_name, u.email AS employee_email
       FROM goal_sheets gs
       JOIN users u ON gs.employee_id = u.id
       WHERE gs.employee_id = $1 AND gs.cycle_id = $2`,
      [employeeId, cycle.id]
    );

    let sheet = sheetRes.rows[0] || null;
    let goals = [];

    if (sheet) {
      const goalsRes = await pool.query(
        `SELECT g.*, ta.name AS thrust_area_name,
                COALESCE(
                  (SELECT c.progress_score 
                   FROM checkins c 
                   WHERE c.goal_id = g.id 
                   ORDER BY c.checked_in_at DESC LIMIT 1), 
                  0
                ) AS progress_score
         FROM goals g
         LEFT JOIN thrust_areas ta ON g.thrust_area_id = ta.id
         WHERE g.goal_sheet_id = $1
         ORDER BY g.id`,
        [sheet.id]
      );
      goals = goalsRes.rows;
    }

    res.json({ cycle, sheet, goals });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const createGoalSheet = async (req, res) => {
  const employeeId = req.user.id;
  const { cycleId } = req.body;

  try {
    const cycleRes = await pool.query('SELECT window_open, window_close, cycle_name FROM goal_cycles WHERE id = $1', [cycleId]);
    if (!cycleRes.rows.length) return res.status(404).json({ message: 'Cycle not found' });
    
    const cycle = cycleRes.rows[0];
    const now = new Date();
    if (now < new Date(cycle.window_open) || now > new Date(cycle.window_close)) {
      return res.status(403).json({ message: `The review window for ${cycle.cycle_name} is currently closed.` });
    }
    const existing = await pool.query(
      'SELECT id FROM goal_sheets WHERE employee_id = $1 AND cycle_id = $2',
      [employeeId, cycleId]
    );

    if (existing.rows.length)
      return res.status(400).json({ message: 'Goal sheet already exists for this cycle' });

    const result = await pool.query(
      `INSERT INTO goal_sheets (employee_id, cycle_id, status)
       VALUES ($1, $2, 'DRAFT') RETURNING *`,
      [employeeId, cycleId]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

const addGoal = async (req, res) => {
  const {
    goalSheetId,
    thrustAreaId,
    title,
    description,
    uomType,
    targetValue,
    targetDate,
    weightage
  } = req.body;

  if (!title || !uomType || !weightage)
    return res.status(400).json({ message: 'Title, UoM type, and weightage are required' });

  if (weightage < 10)
    return res.status(400).json({ message: 'Minimum weightage per goal is 10%' });

  try {
    const sheetRes = await pool.query(
      'SELECT * FROM goal_sheets WHERE id = $1 AND employee_id = $2',
      [goalSheetId, req.user.id]
    );

    if (!sheetRes.rows.length)
      return res.status(403).json({ message: 'Goal sheet not found or unauthorized' });

    const sheet = sheetRes.rows[0];

    // Block adds when SUBMITTED, APPROVED, or MOD_REQUESTED
    if (sheet.status === 'SUBMITTED' || sheet.status === 'APPROVED' || sheet.status === 'MOD_REQUESTED' || sheet.is_locked)
      return res.status(400).json({ message: 'Goal sheet is locked. You cannot modify goals.' });

    const countRes = await pool.query(
      'SELECT COUNT(*) FROM goals WHERE goal_sheet_id = $1',
      [goalSheetId]
    );

    if (parseInt(countRes.rows[0].count) >= 8)
      return res.status(400).json({ message: 'Maximum 8 goals allowed per employee' });

    const weightRes = await pool.query(
      'SELECT COALESCE(SUM(weightage), 0) AS total FROM goals WHERE goal_sheet_id = $1',
      [goalSheetId]
    );

    const currentTotal = parseFloat(weightRes.rows[0].total);

    if (currentTotal + parseFloat(weightage) > 100)
      return res.status(400).json({
        message: `Total weightage cannot exceed 100%. Current total: ${currentTotal}%, adding: ${weightage}%`,
      });

    const result = await pool.query(
      `INSERT INTO goals (goal_sheet_id, thrust_area_id, title, description, uom_type, target_value, target_date, weightage)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [goalSheetId, thrustAreaId, title, description, uomType, targetValue, targetDate, weightage]
    );

    await logAudit({
      tableName: 'goals',
      recordId: result.rows[0].id,
      action: 'CREATE',
      changedBy: req.user.id,
      newValues: result.rows[0]
    });

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const updateGoal = async (req, res) => {
  const { id } = req.params;
  const {
    thrustAreaId,
    title,
    description,
    uomType,
    targetValue,
    targetDate,
    weightage
  } = req.body;

  try {
    const goalRes = await pool.query(
      `SELECT g.*, gs.is_locked, gs.employee_id, gs.status AS gs_status
       FROM goals g
       JOIN goal_sheets gs ON g.goal_sheet_id = gs.id WHERE g.id = $1`,
      [id]
    );

    if (!goalRes.rows.length) return res.status(404).json({ message: 'Goal not found' });

    const goal = goalRes.rows[0];

    if (goal.employee_id !== req.user.id)
      return res.status(403).json({ message: 'Unauthorized' });

    // Block edits when SUBMITTED, APPROVED, or MOD_REQUESTED
    if (goal.gs_status === 'SUBMITTED' || goal.gs_status === 'APPROVED' || goal.gs_status === 'MOD_REQUESTED' || goal.is_locked)
      return res.status(400).json({ message: 'Goal sheet is locked. You cannot modify goals.' });

    if (weightage < 10)
      return res.status(400).json({ message: 'Minimum weightage per goal is 10%' });

    const weightRes = await pool.query(
      'SELECT COALESCE(SUM(weightage), 0) AS total FROM goals WHERE goal_sheet_id = $1 AND id != $2',
      [goal.goal_sheet_id, id]
    );

    if (parseFloat(weightRes.rows[0].total) + parseFloat(weightage) > 100)
      return res.status(400).json({ message: 'Total weightage cannot exceed 100%' });

    const old = { ...goal };

    const result = await pool.query(
      `UPDATE goals SET thrust_area_id=$1, title=$2, description=$3, uom_type=$4,
       target_value=$5, target_date=$6, weightage=$7 WHERE id=$8 RETURNING *`,
      [thrustAreaId, title, description, uomType, targetValue, targetDate, weightage, id]
    );

    await logAudit({
      tableName: 'goals',
      recordId: id,
      action: 'UPDATE',
      changedBy: req.user.id,
      oldValues: old,
      newValues: result.rows[0]
    });

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

const deleteGoal = async (req, res) => {
  const { id } = req.params;

  try {
    const goalRes = await pool.query(
      `SELECT g.*, gs.is_locked, gs.status AS gs_status, gs.employee_id
       FROM goals g
       JOIN goal_sheets gs ON g.goal_sheet_id = gs.id WHERE g.id = $1`,
      [id]
    );

    if (!goalRes.rows.length) return res.status(404).json({ message: 'Goal not found' });

    const goal = goalRes.rows[0];

    if (goal.employee_id !== req.user.id)
      return res.status(403).json({ message: 'Unauthorized' });

    // Block deletes when SUBMITTED, APPROVED, or MOD_REQUESTED
    if (goal.gs_status === 'SUBMITTED' || goal.gs_status === 'APPROVED' || goal.gs_status === 'MOD_REQUESTED' || goal.is_locked)
      return res.status(400).json({ message: 'Goal sheet is locked. You cannot modify goals.' });

    await pool.query('DELETE FROM goals WHERE id = $1', [id]);

    await logAudit({
      tableName: 'goals',
      recordId: id,
      action: 'DELETE',
      changedBy: req.user.id,
      oldValues: goal
    });

    res.json({ message: 'Goal deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

const submitGoalSheet = async (req, res) => {
  const { sheetId } = req.params;

  try {
    const sheetRes = await pool.query(
      `SELECT gs.*, u.name AS emp_name, u.manager_id,
              m.email AS manager_email, m.name AS manager_name
       FROM goal_sheets gs
       JOIN users u ON gs.employee_id = u.id
       LEFT JOIN users m ON u.manager_id = m.id
       WHERE gs.id = $1 AND gs.employee_id = $2`,
      [sheetId, req.user.id]
    );

    if (!sheetRes.rows.length)
      return res.status(403).json({ message: 'Sheet not found or unauthorized' });

    const sheet = sheetRes.rows[0];

    // Cannot re-submit a sheet that's already waiting for review
    if (sheet.status === 'SUBMITTED')
      return res.status(400).json({ message: 'Sheet is already submitted and awaiting manager review.' });

    const weightRes = await pool.query(
      'SELECT COALESCE(SUM(weightage), 0) AS total, COUNT(*) AS cnt FROM goals WHERE goal_sheet_id = $1',
      [sheetId]
    );

    const { total, cnt } = weightRes.rows[0];

    if (parseInt(cnt) === 0)
      return res.status(400).json({ message: 'Add at least one goal before submitting' });

    if (Math.abs(parseFloat(total) - 100) > 0.01)
      return res.status(400).json({
        message: `Total weightage must equal 100%. Current total: ${parseFloat(total).toFixed(2)}%`,
      });

    // Unlock the sheet so goals can be saved again
    await pool.query(
      `UPDATE goal_sheets SET status = 'SUBMITTED', submitted_at = NOW(), is_locked = FALSE WHERE id = $1`,
      [sheetId]
    );

    if (sheet.manager_email) {
      const tpl = emailTemplates.goalSubmitted(sheet.emp_name, sheet.manager_name);
      await sendEmail({ to: sheet.manager_email, ...tpl });
    }

    await pool.query(
      `INSERT INTO notifications (user_id, type, message, related_id)
       VALUES ($1, 'GOAL_SUBMITTED', $2, $3)`,
      [sheet.manager_id, `${sheet.emp_name} has submitted their goal sheet for review`, sheetId]
    );

    try {
      const { emitToManager } = require('../config/socket');
      emitToManager(sheet.manager_id, 'goal_submitted', {
        employeeName: sheet.emp_name,
        sheetId: sheetId,
        message: `${sheet.emp_name} has submitted their goal sheet for review`
      });
      emitToManager(sheet.manager_id, 'new_notification', {
        type: 'GOAL_SUBMITTED',
        message: `${sheet.emp_name} has submitted their goal sheet for review`,
        relatedId: sheetId
      });
    } catch (socketErr) {
      console.error('Socket notification failed:', socketErr);
    }

    await logAudit({
      tableName: 'goal_sheets',
      recordId: sheetId,
      action: 'UPDATE',
      changedBy: req.user.id,
      oldValues: { status: sheet.status },
      newValues: { status: 'SUBMITTED' }
    });

    res.json({ message: 'Goal sheet submitted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const requestModification = async (req, res) => {
  const { sheetId } = req.params;
  const employeeId = req.user.id;

  try {
    const sheetRes = await pool.query(
      `SELECT gs.*, u.name AS emp_name, u.manager_id,
              m.email AS manager_email, m.name AS manager_name
       FROM goal_sheets gs
       JOIN users u ON gs.employee_id = u.id
       LEFT JOIN users m ON u.manager_id = m.id
       WHERE gs.id = $1 AND gs.employee_id = $2`,
      [sheetId, employeeId]
    );

    if (!sheetRes.rows.length)
      return res.status(404).json({ message: 'Goal sheet not found or unauthorized' });

    const sheet = sheetRes.rows[0];

    if (sheet.status !== 'APPROVED') {
      return res.status(400).json({ message: 'Modification can only be requested for approved sheets.' });
    }

    // Set sheet status to 'MOD_REQUESTED' (keeps is_locked = true until approved by manager)
    await pool.query(
      `UPDATE goal_sheets SET status = 'MOD_REQUESTED' WHERE id = $1`,
      [sheetId]
    );

    // Send email notification to manager
    if (sheet.manager_email) {
      const emailSubject = `Modification Request: ${sheet.emp_name} - goal sheet`;
      const emailBody = `
        <p>Dear ${sheet.manager_name || 'Manager'},</p>
        <p><strong>${sheet.emp_name}</strong> has requested modifications to their approved goal sheet.</p>
        <p>Please log in to the AtomQuest portal to approve or reject this request.</p>
      `;
      await sendEmail({ to: sheet.manager_email, subject: emailSubject, html: emailBody });
    }

    // Push system notification to manager
    await pool.query(
      `INSERT INTO notifications (user_id, type, message, related_id)
       VALUES ($1, 'MOD_REQUESTED', $2, $3)`,
      [sheet.manager_id, `${sheet.emp_name} has requested modifications to approved goals`, sheetId]
    );

    try {
      const { emitToManager } = require('../config/socket');
      emitToManager(sheet.manager_id, 'goal_submitted', {
        employeeName: sheet.emp_name,
        sheetId: sheetId,
        message: `${sheet.emp_name} has requested modifications to approved goals`
      });
      emitToManager(sheet.manager_id, 'new_notification', {
        type: 'MOD_REQUESTED',
        message: `${sheet.emp_name} has requested modifications to approved goals`,
        relatedId: sheetId
      });
    } catch (socketErr) {
      console.error('Socket error in requestModification:', socketErr);
    }

    await logAudit({
      tableName: 'goal_sheets',
      recordId: sheetId,
      action: 'UPDATE',
      changedBy: req.user.id,
      oldValues: { status: 'APPROVED' },
      newValues: { status: 'MOD_REQUESTED' }
    });

    res.json({ message: 'Modification request submitted successfully to your manager.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getThrustAreas = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM thrust_areas ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

const getCycles = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM goal_cycles ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getMyGoalSheet,
  createGoalSheet,
  addGoal,
  updateGoal,
  deleteGoal,
  submitGoalSheet,
  requestModification,
  getThrustAreas,
  getCycles
};