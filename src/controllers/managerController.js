const pool = require('../config/db');
const { logAudit } = require('../middleware/auditLogger');
const { sendEmail, emailTemplates } = require('../config/email');

const isAdmin = (req) => req.user.role === 'ADMIN';

const getTeamSheets = async (req, res) => {
  const { cycleId } = req.query;

  try {
    const cycleRes = await pool.query(
      `SELECT id FROM goal_cycles WHERE ${cycleId ? 'id = $1' : 'is_active = TRUE'} LIMIT 1`,
      cycleId ? [cycleId] : []
    );

    if (!cycleRes.rows.length) {
      return res.status(404).json({ message: 'Cycle not found' });
    }

    const activeCycleId = cycleRes.rows[0].id;

    let result;

    if (isAdmin(req)) {
      result = await pool.query(
        `SELECT gs.id AS id, 
                gs.status, 
                gs.is_locked, 
                gs.cycle_id, 
                gs.return_reason AS reason, 
                u.id AS employee_id,
                u.name AS employee_name, 
                u.email AS employee_email, 
                u.department,
                m.name AS manager_name,
                COUNT(DISTINCT g.id) AS goal_count,
                COALESCE(SUM(g.weightage), 0) AS total_weightage,
                ROUND(COALESCE(AVG(c.progress_score), 0), 1) AS average_progress,
                COUNT(DISTINCT CASE WHEN UPPER(c.status) = 'COMPLETED' THEN g.id END) AS completed_goals,
                COUNT(DISTINCT CASE WHEN UPPER(c.status) = 'ON_TRACK' THEN g.id END) AS on_track_goals,
                COUNT(DISTINCT CASE WHEN UPPER(c.status) = 'NOT_STARTED' OR c.status IS NULL THEN g.id END) AS not_started_goals,
                COUNT(DISTINCT CASE WHEN c.id IS NULL THEN g.id END) AS pending_checkins
         FROM users u
         LEFT JOIN users m ON u.manager_id = m.id
         LEFT JOIN goal_sheets gs ON gs.employee_id = u.id AND gs.cycle_id = $1
         LEFT JOIN goals g ON g.goal_sheet_id = gs.id
         LEFT JOIN checkins c ON c.goal_id = g.id
         WHERE u.role = 'EMPLOYEE' AND u.is_suspended = FALSE
         GROUP BY gs.id, u.id, m.name
         ORDER BY u.name`,
        [activeCycleId]
      );
    } else {
      result = await pool.query(
        `SELECT gs.id AS id, 
                gs.status, 
                gs.is_locked, 
                gs.cycle_id, 
                gs.return_reason AS reason, 
                u.id AS employee_id,
                u.name AS employee_name, 
                u.email AS employee_email, 
                u.department,
                COUNT(DISTINCT g.id) AS goal_count,
                COALESCE(SUM(g.weightage), 0) AS total_weightage,
                ROUND(COALESCE(AVG(c.progress_score), 0), 1) AS average_progress,
                COUNT(DISTINCT CASE WHEN UPPER(c.status) = 'COMPLETED' THEN g.id END) AS completed_goals,
                COUNT(DISTINCT CASE WHEN UPPER(c.status) = 'ON_TRACK' THEN g.id END) AS on_track_goals,
                COUNT(DISTINCT CASE WHEN UPPER(c.status) = 'NOT_STARTED' OR c.status IS NULL THEN g.id END) AS not_started_goals,
                COUNT(DISTINCT CASE WHEN c.id IS NULL THEN g.id END) AS pending_checkins
         FROM users u
         LEFT JOIN goal_sheets gs ON gs.employee_id = u.id AND gs.cycle_id = $2
         LEFT JOIN goals g ON g.goal_sheet_id = gs.id
         LEFT JOIN checkins c ON c.goal_id = g.id
         WHERE u.manager_id = $1 AND u.is_suspended = FALSE
         GROUP BY gs.id, u.id
         ORDER BY u.name`,
        [req.user.id, activeCycleId]
      );
    }

    res.json(result.rows);
  } catch (err) {
    console.error('getTeamSheets error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getSheetDetails = async (req, res) => {
  const { sheetId } = req.params;

  if (!sheetId || sheetId === 'null' || isNaN(Number(sheetId))) {
    return res.status(404).json({ message: 'No goal sheet has been created yet for this employee.' });
  }

  try {
    let sheetRes;

    if (isAdmin(req)) {
      sheetRes = await pool.query(
        `SELECT gs.*, u.name AS employee_name, u.email AS employee_email,
                u.department, u.manager_id, m.name AS manager_name
         FROM goal_sheets gs
         JOIN users u ON gs.employee_id = u.id
         LEFT JOIN users m ON u.manager_id = m.id
         WHERE gs.id = $1`,
        [sheetId]
      );
    } else {
      sheetRes = await pool.query(
        `SELECT gs.*, u.name AS employee_name, u.email AS employee_email,
                u.department, u.manager_id
         FROM goal_sheets gs
         JOIN users u ON gs.employee_id = u.id
         WHERE gs.id = $1 AND u.manager_id = $2`,
        [sheetId, req.user.id]
      );
    }

    if (!sheetRes.rows.length) {
      return res.status(403).json({ message: 'Sheet not found or unauthorized' });
    }

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
      [sheetId]
    );

    res.json({ sheet: sheetRes.rows[0], goals: goalsRes.rows });
  } catch (err) {
    console.error('getSheetDetails error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

const managerEditGoal = async (req, res) => {
  const { goalId } = req.params;
  const { targetValue, targetDate, weightage, title, description, uomType } = req.body;

  try {
    const goalRes = await pool.query(
      `SELECT g.*, gs.status, gs.is_locked, gs.id AS goal_sheet_id,
              u.manager_id, u.id AS employee_id, u.name AS employee_name, u.email AS employee_email
       FROM goals g
       JOIN goal_sheets gs ON g.goal_sheet_id = gs.id
       JOIN users u ON gs.employee_id = u.id
       WHERE g.id = $1`,
      [goalId]
    );

    if (!goalRes.rows.length) {
      return res.status(404).json({ message: 'Goal not found' });
    }

    const goal = goalRes.rows[0];

    if (!isAdmin(req) && goal.manager_id !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    if (goal.status === 'APPROVED' && !isAdmin(req)) {
      return res.status(400).json({ message: 'Cannot edit an approved goal sheet. Admin must unlock it first.' });
    }

    if (weightage !== undefined && Number(weightage) < 10) {
      return res.status(400).json({ message: 'Minimum weightage per goal is 10%' });
    }

    if (weightage !== undefined) {
      const weightRes = await pool.query(
        `SELECT COALESCE(SUM(weightage), 0) AS total
         FROM goals
         WHERE goal_sheet_id = $1 AND id != $2`,
        [goal.goal_sheet_id, goalId]
      );

      const currentOtherTotal = parseFloat(weightRes.rows[0].total || 0);
      if (currentOtherTotal + parseFloat(weightage) > 100) {
        return res.status(400).json({ message: 'Total weightage cannot exceed 100%' });
      }
    }

    const old = {
      title: goal.title,
      description: goal.description,
      uomType: goal.uom_type,
      targetValue: goal.target_value,
      targetDate: goal.target_date,
      weightage: goal.weightage
    };

    const result = await pool.query(
      `UPDATE goals
       SET target_value = $1,
           target_date = $2,
           weightage = $3,
           title = $4,
           description = $5,
           uom_type = $6
       WHERE id = $7
       RETURNING *`,
      [
        targetValue !== undefined ? targetValue : goal.target_value,
        targetDate !== undefined ? targetDate : goal.target_date,
        weightage !== undefined ? weightage : goal.weightage,
        title !== undefined ? title : goal.title,
        description !== undefined ? description : goal.description,
        uomType !== undefined ? uomType : goal.uom_type,
        goalId
      ]
    );

    await logAudit({
      tableName: 'goals',
      recordId: goalId,
      action: 'UPDATE',
      changedBy: req.user.id,
      oldValues: old,
      newValues: result.rows[0]
    });

    // 1. Insert App Notification
    await pool.query(
      `INSERT INTO notifications (user_id, type, message, related_id)
       VALUES ($1, 'GOAL_UPDATED', $2, $3)`,
      [
        goal.employee_id,
        `${req.user.name} (${req.user.role === 'ADMIN' ? 'Admin' : 'Manager'}) updated your goal "${result.rows[0].title}"`,
        goal.goal_sheet_id
      ]
    );

    // 2. Real-Time Socket Emitters
    try {
      const { emitToUser } = require('../config/socket');
      emitToUser(goal.employee_id, 'shared_goal_updated', {
        message: `${req.user.name} (${req.user.role === 'ADMIN' ? 'Admin' : 'Manager'}) updated your goal "${result.rows[0].title}"`,
        goal: result.rows[0]
      });
      emitToUser(goal.employee_id, 'new_notification', {
        type: 'GOAL_UPDATED',
        message: `${req.user.name} (${req.user.role === 'ADMIN' ? 'Admin' : 'Manager'}) updated your goal "${result.rows[0].title}"`,
        relatedId: goal.goal_sheet_id
      });
    } catch (socketErr) {
      console.error('Socket notification error in managerEditGoal:', socketErr);
    }

    // 3. Send Email Notification
    try {
      const emailSubject = `Goal Updated by ${req.user.role === 'ADMIN' ? 'Admin' : 'Manager'}`;
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
          <div style="background-color: #006C63; color: white; padding: 20px; text-align: center;">
            <h2 style="margin: 0; font-size: 20px;">Goal Updated Notification</h2>
          </div>
          <div style="padding: 24px;">
            <p>Hello <strong>${goal.employee_name}</strong>,</p>
            <p>Your goal has been updated by <strong>${req.user.name} (${req.user.role === 'ADMIN' ? 'Admin' : 'Manager'})</strong>.</p>
            
            <h3 style="border-b: 1px solid #eee; padding-bottom: 8px; color: #006C63; margin-top: 24px;">Updated Details</h3>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <tr style="background-color: #f9f9f9;">
                <td style="padding: 12px; border: 1px solid #eee; font-weight: bold; width: 140px;">Goal Title</td>
                <td style="padding: 12px; border: 1px solid #eee;">${result.rows[0].title}</td>
              </tr>
              <tr>
                <td style="padding: 12px; border: 1px solid #eee; font-weight: bold;">Description</td>
                <td style="padding: 12px; border: 1px solid #eee;">${result.rows[0].description || 'N/A'}</td>
              </tr>
              <tr style="background-color: #f9f9f9;">
                <td style="padding: 12px; border: 1px solid #eee; font-weight: bold;">Measurement Type</td>
                <td style="padding: 12px; border: 1px solid #eee;">${result.rows[0].uom_type}</td>
              </tr>
              <tr>
                <td style="padding: 12px; border: 1px solid #eee; font-weight: bold;">Target Value</td>
                <td style="padding: 12px; border: 1px solid #eee;">${result.rows[0].target_value || 'N/A'}</td>
              </tr>
              <tr style="background-color: #f9f9f9;">
                <td style="padding: 12px; border: 1px solid #eee; font-weight: bold;">Target Date</td>
                <td style="padding: 12px; border: 1px solid #eee;">${result.rows[0].target_date ? new Date(result.rows[0].target_date).toLocaleDateString('en-IN') : 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 12px; border: 1px solid #eee; font-weight: bold;">Weightage</td>
                <td style="padding: 12px; border: 1px solid #eee;">${result.rows[0].weightage}%</td>
              </tr>
            </table>
            
            <p style="margin-top: 24px;">Please log in to your dashboard to view the changes.</p>
          </div>
          <div style="background-color: #f5f5f5; color: #666; padding: 16px; text-align: center; font-size: 12px; border-top: 1px solid #eee;">
            This is an automated system email from AtomQuest HR Portal. Please do not reply directly.
          </div>
        </div>
      `;

      await sendEmail({
        to: goal.employee_email,
        subject: emailSubject,
        html: emailHtml
      });
    } catch (emailErr) {
      console.error('Email notification error in managerEditGoal:', emailErr.message);
    }

    res.json({
      message: isAdmin(req) ? 'Goal updated by admin' : 'Goal updated by manager',
      goal: result.rows[0]
    });
  } catch (err) {
    console.error('managerEditGoal error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

const approveSheet = async (req, res) => {
  const { sheetId } = req.params;

  try {
    let sheetRes;

    if (isAdmin(req)) {
      sheetRes = await pool.query(
        `SELECT gs.*, u.id AS employee_id, u.name AS emp_name, u.email AS emp_email, u.manager_id
         FROM goal_sheets gs
         JOIN users u ON gs.employee_id = u.id
         WHERE gs.id = $1`,
        [sheetId]
      );
    } else {
      sheetRes = await pool.query(
        `SELECT gs.*, u.id AS employee_id, u.name AS emp_name, u.email AS emp_email, u.manager_id
         FROM goal_sheets gs
         JOIN users u ON gs.employee_id = u.id
         WHERE gs.id = $1 AND u.manager_id = $2`,
        [sheetId, req.user.id]
      );
    }

    if (!sheetRes.rows.length) {
      return res.status(403).json({ message: 'Sheet not found or unauthorized' });
    }

    const sheet = sheetRes.rows[0];

    if (sheet.status !== 'SUBMITTED' && sheet.status !== 'RETURNED') {
      return res.status(400).json({ message: 'Only SUBMITTED or RETURNED sheets can be approved' });
    }

    await pool.query(
      `UPDATE goal_sheets
       SET status = 'APPROVED',
           is_locked = TRUE,
           approved_at = NOW(),
           approved_by = $1,
           return_reason = NULL
       WHERE id = $2`,
      [req.user.id, sheetId]
    );

    const tpl = emailTemplates.goalApproved(sheet.emp_name);
    await sendEmail({ to: sheet.emp_email, ...tpl });

    await pool.query(
      `INSERT INTO notifications (user_id, type, message, related_id)
       VALUES ($1, 'GOAL_APPROVED', $2, $3)`,
      [
        sheet.employee_id,
        isAdmin(req)
          ? 'Your goal sheet has been approved by Admin/HR!'
          : 'Your goal sheet has been approved by your manager!',
        sheetId
      ]
    );

    try {
      const { emitToUser } = require('../config/socket');
      emitToUser(sheet.employee_id, 'goal_approved', {
        sheetId: sheetId,
        message: 'Your goal sheet has been approved!'
      });
      emitToUser(sheet.employee_id, 'new_notification', {
        type: 'GOAL_APPROVED',
        message: isAdmin(req)
          ? 'Your goal sheet has been approved by Admin/HR!'
          : 'Your goal sheet has been approved by your manager!',
        relatedId: sheetId
      });
    } catch (socketErr) {
      console.error('Socket error in approveSheet:', socketErr);
    }

    await logAudit({
      tableName: 'goal_sheets',
      recordId: sheetId,
      action: 'LOCK',
      changedBy: req.user.id,
      oldValues: { status: sheet.status },
      newValues: { status: 'APPROVED', is_locked: true }
    });

    res.json({
      message: isAdmin(req)
        ? 'Goal sheet approved and locked successfully by Admin'
        : 'Goal sheet approved and locked successfully by Manager'
    });
  } catch (err) {
    console.error('approveSheet error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

const returnSheet = async (req, res) => {
  const { sheetId } = req.params;
  const { reason } = req.body;

  if (!reason) {
    return res.status(400).json({ message: 'Return reason is required' });
  }

  try {
    let sheetRes;

    if (isAdmin(req)) {
      sheetRes = await pool.query(
        `SELECT gs.*, u.id AS employee_id, u.name AS emp_name, u.email AS emp_email, u.manager_id
         FROM goal_sheets gs
         JOIN users u ON gs.employee_id = u.id
         WHERE gs.id = $1`,
        [sheetId]
      );
    } else {
      sheetRes = await pool.query(
        `SELECT gs.*, u.id AS employee_id, u.name AS emp_name, u.email AS emp_email, u.manager_id
         FROM goal_sheets gs
         JOIN users u ON gs.employee_id = u.id
         WHERE gs.id = $1 AND u.manager_id = $2`,
        [sheetId, req.user.id]
      );
    }

    if (!sheetRes.rows.length) {
      return res.status(403).json({ message: 'Sheet not found or unauthorized' });
    }

    const sheet = sheetRes.rows[0];

    await pool.query(
      `UPDATE goal_sheets
       SET status = 'RETURNED',
           return_reason = $1,
           is_locked = FALSE
       WHERE id = $2`,
      [reason, sheetId]
    );

    const tpl = emailTemplates.goalReturned(sheet.emp_name, reason);
    await sendEmail({ to: sheet.emp_email, ...tpl });

    await pool.query(
      `INSERT INTO notifications (user_id, type, message, related_id)
       VALUES ($1, 'GOAL_RETURNED', $2, $3)`,
      [
        sheet.employee_id,
        isAdmin(req)
          ? `Your goal sheet was returned by Admin/HR: ${reason}`
          : `Your goal sheet was returned by Manager: ${reason}`,
        sheetId
      ]
    );

    try {
      const { emitToUser } = require('../config/socket');
      emitToUser(sheet.employee_id, 'goal_returned', {
        sheetId: sheetId,
        message: `Your goal sheet was returned for rework.`
      });
      emitToUser(sheet.employee_id, 'new_notification', {
        type: 'GOAL_RETURNED',
        message: isAdmin(req)
          ? `Your goal sheet was returned by Admin/HR: ${reason}`
          : `Your goal sheet was returned by Manager: ${reason}`,
        relatedId: sheetId
      });
    } catch (socketErr) {
      console.error('Socket error in returnSheet:', socketErr);
    }

    await logAudit({
      tableName: 'goal_sheets',
      recordId: sheetId,
      action: 'UPDATE',
      changedBy: req.user.id,
      oldValues: { status: sheet.status },
      newValues: { status: 'RETURNED', reason, is_locked: false }
    });

    res.json({
      message: isAdmin(req)
        ? 'Goal sheet returned for rework by Admin'
        : 'Goal sheet returned for rework by Manager'
    });
  } catch (err) {
    console.error('returnSheet error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getTeamCheckins = async (req, res) => {
  const { sheetId } = req.params;

  try {
    let accessRes;

    if (isAdmin(req)) {
      accessRes = await pool.query(
        `SELECT gs.id
         FROM goal_sheets gs
         WHERE gs.id = $1`,
        [sheetId]
      );
    } else {
      accessRes = await pool.query(
        `SELECT gs.id
         FROM goal_sheets gs
         JOIN users u ON gs.employee_id = u.id
         WHERE gs.id = $1 AND u.manager_id = $2`,
        [sheetId, req.user.id]
      );
    }

    if (!accessRes.rows.length) {
      return res.status(403).json({ message: 'Sheet not found or unauthorized' });
    }

    const result = await pool.query(
      `SELECT g.id AS goal_id, g.title, g.uom_type, g.target_value, g.target_date, g.weightage,
              c.cycle_phase, c.actual_value, c.actual_date, c.status, c.progress_score,
              c.employee_note, c.manager_comment, c.id AS checkin_id
       FROM goals g
       LEFT JOIN checkins c ON c.goal_id = g.id
       WHERE g.goal_sheet_id = $1
       ORDER BY g.id, c.cycle_phase`,
      [sheetId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('getTeamCheckins error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

const addCheckinComment = async (req, res) => {
  const { checkinId, comment } = req.body;

  if (!comment) {
    return res.status(400).json({ message: 'Comment is required' });
  }

  try {
    const checkRes = await pool.query(
      `SELECT c.id, u.id AS employee_id, u.manager_id, u.name AS employee_name, u.email AS employee_email, g.title AS goal_title
       FROM checkins c
       JOIN goals g ON c.goal_id = g.id
       JOIN goal_sheets gs ON g.goal_sheet_id = gs.id
       JOIN users u ON gs.employee_id = u.id
       WHERE c.id = $1`,
      [checkinId]
    );

    if (!checkRes.rows.length) {
      return res.status(404).json({ message: 'Check-in not found' });
    }

    const checkin = checkRes.rows[0];

    if (!isAdmin(req) && checkin.manager_id !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    await pool.query(
      `UPDATE checkins
       SET manager_comment = $1,
            manager_id = $2,
            manager_reviewed_at = NOW()
       WHERE id = $3`,
      [comment, req.user.id, checkinId]
    );

    await pool.query(
      `INSERT INTO notifications (user_id, type, message, related_id)
       VALUES ($1, 'COMMENT_ADDED', $2, $3)`,
      [
        checkin.employee_id,
        `${req.user.name} added feedback to your goal check-in for "${checkin.goal_title}"`,
        checkinId
      ]
    );

    try {
      const { emitToUser } = require('../config/socket');
      emitToUser(checkin.employee_id, 'shared_goal_updated', {
        message: `${req.user.name} added feedback to your goal check-in for "${checkin.goal_title}"`,
        checkinId: checkinId
      });
      emitToUser(checkin.employee_id, 'new_notification', {
        type: 'COMMENT_ADDED',
        message: `${req.user.name} added feedback to your goal check-in for "${checkin.goal_title}"`,
        relatedId: checkinId
      });
    } catch (socketErr) {
      console.error('Socket error in addCheckinComment:', socketErr);
    }

    try {
      const tpl = emailTemplates.checkinCommentAdded(
        checkin.employee_name,
        req.user.name,
        checkin.goal_title,
        comment
      );
      await sendEmail({ to: checkin.employee_email, ...tpl });
    } catch (emailErr) {
      console.error('Checkin comment email failed (non-fatal):', emailErr.message);
    }

    res.json({
      message: isAdmin(req)
        ? 'Check-in comment added by Admin'
        : 'Check-in comment added by Manager'
    });
  } catch (err) {
    console.error('addCheckinComment error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

const pushGoalToTeam = async (req, res) => {
  const { title, description, thrustAreaId, uomType, targetValue, targetDate, employeeIds } = req.body;

  if (!employeeIds || !employeeIds.length) {
    return res.status(400).json({ message: 'No employees selected' });
  }

  if (!title || !uomType) {
    return res.status(400).json({ message: 'Title and Measurement Type are required' });
  }

  try {
    for (const empId of employeeIds) {
      const sheetRes = await pool.query(
        `SELECT gs.id FROM goal_sheets gs 
         JOIN goal_cycles c ON gs.cycle_id = c.id 
         WHERE gs.employee_id = $1 AND c.is_active = TRUE LIMIT 1`, 
        [empId]
      );
      if (sheetRes.rows.length) {
        const sheetId = sheetRes.rows[0].id;
        await pool.query(
          `INSERT INTO goals (goal_sheet_id, thrust_area_id, title, description, uom_type, target_value, target_date, weightage, is_shared)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)`,
          [sheetId, thrustAreaId || null, title, description || '', uomType, targetValue || null, targetDate || null, 10]
        );

        try {
          const empRes = await pool.query('SELECT name, email FROM users WHERE id = $1', [empId]);
          const emp = empRes.rows[0];
          if (emp) {
            const tpl = emailTemplates.kpiBroadcasted(emp.name, title);
            await sendEmail({ to: emp.email, ...tpl });
          }
        } catch (emailErr) {
          console.error('KPI broadcast email failed (non-fatal):', emailErr.message);
        }
      }
    }
    
    res.json({ message: 'KPI broadcasted successfully' });
  } catch (err) {
    console.error('pushGoalToTeam error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getSharedGoals = async (req, res) => {
  try {
    let result;
    if (isAdmin(req)) {
      result = await pool.query(
        `SELECT g.title, g.uom_type, g.target_value, g.target_date, u.name AS employee_name, u.email AS employee_email
         FROM goals g
         JOIN goal_sheets gs ON g.goal_sheet_id = gs.id
         JOIN users u ON gs.employee_id = u.id
         JOIN goal_cycles gc ON gs.cycle_id = gc.id
         WHERE g.is_shared = TRUE AND gc.is_active = TRUE
         ORDER BY g.title, u.name`
      );
    } else {
      result = await pool.query(
        `SELECT g.title, g.uom_type, g.target_value, g.target_date, u.name AS employee_name, u.email AS employee_email
         FROM goals g
         JOIN goal_sheets gs ON g.goal_sheet_id = gs.id
         JOIN users u ON gs.employee_id = u.id
         JOIN goal_cycles gc ON gs.cycle_id = gc.id
         WHERE u.manager_id = $1 AND g.is_shared = TRUE AND gc.is_active = TRUE
         ORDER BY g.title, u.name`,
        [req.user.id]
      );
    }

    const grouped = {};
    result.rows.forEach(row => {
      if (!grouped[row.title]) {
        grouped[row.title] = {
          title: row.title,
          uom_type: row.uom_type,
          target_value: row.target_value,
          target_date: row.target_date,
          employees: []
        };
      }
      grouped[row.title].employees.push({
        name: row.employee_name,
        email: row.employee_email,
        target_value: row.target_value
      });
    });

    res.json(Object.values(grouped));
  } catch (err) {
    console.error('getSharedGoals error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

const approveModification = async (req, res) => {
  const { sheetId } = req.params;

  try {
    let sheetRes;
    if (isAdmin(req)) {
      sheetRes = await pool.query(
        `SELECT gs.*, u.id AS employee_id, u.name AS emp_name, u.email AS emp_email
         FROM goal_sheets gs
         JOIN users u ON gs.employee_id = u.id
         WHERE gs.id = $1`,
        [sheetId]
      );
    } else {
      sheetRes = await pool.query(
        `SELECT gs.*, u.id AS employee_id, u.name AS emp_name, u.email AS emp_email
         FROM goal_sheets gs
         JOIN users u ON gs.employee_id = u.id
         WHERE gs.id = $1 AND u.manager_id = $2`,
        [sheetId, req.user.id]
      );
    }

    if (!sheetRes.rows.length) {
      return res.status(403).json({ message: 'Sheet not found or unauthorized' });
    }

    const sheet = sheetRes.rows[0];

    if (sheet.status !== 'MOD_REQUESTED') {
      return res.status(400).json({ message: 'Sheet is not in modification requested state.' });
    }

    // Set sheet status to 'EDITABLE' and is_locked to FALSE
    await pool.query(
      `UPDATE goal_sheets SET status = 'EDITABLE', is_locked = FALSE WHERE id = $1`,
      [sheetId]
    );

    // Send email notification to employee
    const emailSubject = `Modification Request Approved - AtomQuest`;
    const emailBody = `
      <p>Dear ${sheet.emp_name},</p>
      <p>Your request to modify your approved goal sheet has been <strong>approved</strong>.</p>
      <p>Your sheet is now unlocked and in **EDITABLE** status. You can make adjustments and submit it again for manager approval.</p>
    `;
    await sendEmail({ to: sheet.emp_email, subject: emailSubject, html: emailBody });

    // Push system notification to employee
    await pool.query(
      `INSERT INTO notifications (user_id, type, message, related_id)
       VALUES ($1, 'MODIFICATION_APPROVED', $2, $3)`,
      [sheet.employee_id, 'Your modification request has been approved! Your sheet is now unlocked and editable.', sheetId]
    );

    try {
      const { emitToUser } = require('../config/socket');
      emitToUser(sheet.employee_id, 'sheet_reopened', {
        sheetId: sheetId,
        message: 'Your goal sheet is reopened for editing.'
      });
      emitToUser(sheet.employee_id, 'new_notification', {
        type: 'MODIFICATION_APPROVED',
        message: 'Your modification request has been approved! Your sheet is now unlocked and editable.',
        relatedId: sheetId
      });
    } catch (socketErr) {
      console.error('Socket error in approveModification:', socketErr);
    }

    await logAudit({
      tableName: 'goal_sheets',
      recordId: sheetId,
      action: 'UNLOCK',
      changedBy: req.user.id,
      oldValues: { status: 'MOD_REQUESTED', is_locked: true },
      newValues: { status: 'EDITABLE', is_locked: false }
    });

    res.json({ message: 'Modification request approved successfully. Sheet is now unlocked and editable.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const rejectModification = async (req, res) => {
  const { sheetId } = req.params;
  const { reason } = req.body;

  try {
    let sheetRes;
    if (isAdmin(req)) {
      sheetRes = await pool.query(
        `SELECT gs.*, u.id AS employee_id, u.name AS emp_name, u.email AS emp_email
         FROM goal_sheets gs
         JOIN users u ON gs.employee_id = u.id
         WHERE gs.id = $1`,
        [sheetId]
      );
    } else {
      sheetRes = await pool.query(
        `SELECT gs.*, u.id AS employee_id, u.name AS emp_name, u.email AS emp_email
         FROM goal_sheets gs
         JOIN users u ON gs.employee_id = u.id
         WHERE gs.id = $1 AND u.manager_id = $2`,
        [sheetId, req.user.id]
      );
    }

    if (!sheetRes.rows.length) {
      return res.status(403).json({ message: 'Sheet not found or unauthorized' });
    }

    const sheet = sheetRes.rows[0];

    if (sheet.status !== 'MOD_REQUESTED') {
      return res.status(400).json({ message: 'Sheet is not in modification requested state.' });
    }

    // Set sheet status back to 'APPROVED' and keep is_locked = TRUE
    await pool.query(
      `UPDATE goal_sheets SET status = 'APPROVED', is_locked = TRUE WHERE id = $1`,
      [sheetId]
    );

    // Send email notification to employee
    const emailSubject = `Modification Request Rejected - AtomQuest`;
    const emailBody = `
      <p>Dear ${sheet.emp_name},</p>
      <p>Your request to modify your approved goal sheet has been <strong>rejected</strong>.</p>
      ${reason ? `<p><strong>Reason for rejection:</strong> ${reason}</p>` : ''}
      <p>Your sheet remains locked and in **APPROVED** status.</p>
    `;
    await sendEmail({ to: sheet.emp_email, subject: emailSubject, html: emailBody });

    // Push system notification to employee
    await pool.query(
      `INSERT INTO notifications (user_id, type, message, related_id)
       VALUES ($1, 'MODIFICATION_REJECTED', $2, $3)`,
      [sheet.employee_id, `Your modification request was rejected. ${reason ? `Reason: ${reason}` : ''}`, sheetId]
    );

    try {
      const { emitToUser } = require('../config/socket');
      emitToUser(sheet.employee_id, 'sheet_rejected', {
        sheetId: sheetId,
        message: `Your modification request was rejected. ${reason ? `Reason: ${reason}` : ''}`
      });
      emitToUser(sheet.employee_id, 'new_notification', {
        type: 'MODIFICATION_REJECTED',
        message: `Your modification request was rejected. ${reason ? `Reason: ${reason}` : ''}`,
        relatedId: sheetId
      });
    } catch (socketErr) {
      console.error('Socket error in rejectModification:', socketErr);
    }

    await logAudit({
      tableName: 'goal_sheets',
      recordId: sheetId,
      action: 'UPDATE',
      changedBy: req.user.id,
      oldValues: { status: 'MOD_REQUESTED' },
      newValues: { status: 'APPROVED' }
    });

    res.json({ message: 'Modification request rejected successfully. Sheet remains locked.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
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
};