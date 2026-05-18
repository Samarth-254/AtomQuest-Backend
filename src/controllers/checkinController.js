const pool = require('../config/db');
const { logAudit } = require('../middleware/auditLogger');
const { sendEmail, emailTemplates } = require('../config/email');

const computeScore = (uomType, targetValue, actualValue, targetDate, actualDate) => {
  const target = Number(targetValue);
  const actual = Number(actualValue);

  switch (uomType) {
    case 'MAX': // Maximize (Higher is Better) -> Achievement ÷ Target
      if (!target || target === 0) return 0;
      return Number(Math.min((actual / target) * 100, 150).toFixed(2));

    case 'MIN': // Minimize (Lower is Better) -> Target ÷ Achievement
      if (!actual || actual === 0) return 100;
      return Number(Math.min((target / actual) * 100, 150).toFixed(2));

    case 'TIMELINE':
      if (!targetDate || !actualDate) return 0;
      return new Date(actualDate) <= new Date(targetDate) ? 100 : 0;

    case 'ZERO':
      return actual === 0 ? 100 : 0;

    default:
      return 0;
  }
};

const upsertCheckin = async (req, res) => {
  const { goalId, cyclePhase, actualValue, actualDate, status, employeeNote, progressScore } = req.body;

  if (!goalId || !cyclePhase || !status)
    return res.status(400).json({ message: 'goalId, cyclePhase, and status are required' });

  try {
    const cycleRes = await pool.query(`SELECT * FROM goal_cycles WHERE is_active = TRUE LIMIT 1`);
    if (!cycleRes.rows.length) return res.status(403).json({ message: 'No active review cycle open.' });
    
    const cycle = cycleRes.rows[0];
    const now = new Date();
    if (now < new Date(cycle.window_open) || now > new Date(cycle.window_close)) {
      return res.status(403).json({ message: `The review window for ${cycle.cycle_name} is currently closed.` });
    }
    const goalRes = await pool.query(
      `SELECT g.*, gs.employee_id, gs.is_locked
       FROM goals g JOIN goal_sheets gs ON g.goal_sheet_id = gs.id
       WHERE g.id = $1`,
      [goalId]
    );

    if (!goalRes.rows.length)
      return res.status(404).json({ message: 'Goal not found' });

    const goal = goalRes.rows[0];

    if (goal.employee_id !== req.user.id)
      return res.status(403).json({ message: 'Unauthorized' });

    if (!goal.is_locked)
      return res.status(400).json({ message: 'Goals must be approved before check-in' });

    const score = progressScore !== undefined && progressScore !== null
      ? Number(progressScore)
      : computeScore(
          goal.uom_type,
          goal.target_value,
          actualValue,
          goal.target_date,
          actualDate
        );

    const result = await pool.query(
      `INSERT INTO checkins (goal_id, cycle_phase, actual_value, actual_date, status, progress_score, employee_note, checked_in_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (goal_id, cycle_phase)
       DO UPDATE SET actual_value=$3, actual_date=$4, status=$5, progress_score=$6, employee_note=$7, checked_in_at=NOW()
       RETURNING *`,
      [goalId, cyclePhase, actualValue, actualDate, status, score, employeeNote]
    );

    await logAudit({
      tableName: 'checkins',
      recordId: result.rows[0].id,
      action: 'UPDATE',
      changedBy: req.user.id,
      newValues: result.rows[0]
    });

    if (goal.is_shared && !goal.parent_goal_id) {
      await pool.query(
        `INSERT INTO checkins (goal_id, cycle_phase, actual_value, actual_date, status, progress_score, checked_in_at)
         SELECT id, $2, $3, $4, $5, $6, NOW() FROM goals WHERE parent_goal_id = $1
         ON CONFLICT (goal_id, cycle_phase)
         DO UPDATE SET actual_value=EXCLUDED.actual_value, actual_date=EXCLUDED.actual_date, status=EXCLUDED.status, progress_score=EXCLUDED.progress_score, checked_in_at=NOW()`,
        [goalId, cyclePhase, actualValue, actualDate, status, score]
      );

      // Fetch linked employee ids to emit live socket update
      try {
        const linkedRes = await pool.query(
          `SELECT gs.employee_id 
           FROM goals g 
           JOIN goal_sheets gs ON g.goal_sheet_id = gs.id 
           WHERE g.parent_goal_id = $1`,
          [goalId]
        );
        const { emitToUser } = require('../config/socket');
        linkedRes.rows.forEach(row => {
          emitToUser(row.employee_id, 'shared_goal_updated', {
            parentGoalId: goalId,
            cyclePhase,
            actualValue,
            status,
            progressScore: score,
            message: `Primary owner has updated achievement for your shared KPI: ${goal.title}`
          });
        });
      } catch (socketErr) {
        console.error('Socket error in shared goal sync:', socketErr);
      }
    }

    // Notify manager via email when employee submits checkin
    try {
      const managerRes = await pool.query(
        `SELECT m.email AS manager_email, m.name AS manager_name, u.name AS emp_name, gc.phase, u.manager_id, u.id AS employee_id
         FROM goals g
         JOIN goal_sheets gs ON g.goal_sheet_id = gs.id
         JOIN users u ON gs.employee_id = u.id
         LEFT JOIN users m ON u.manager_id = m.id
         LEFT JOIN goal_cycles gc ON gs.cycle_id = gc.id
         WHERE g.id = $1`,
        [goalId]
      );
      const mr = managerRes.rows[0];
      if (mr?.manager_email) {
        const tpl = emailTemplates.checkinSaved(mr.manager_name, mr.emp_name, cyclePhase);
        await sendEmail({ to: mr.manager_email, ...tpl });
      }

      // Live socket triggers
      if (mr) {
        const { emitToManager, emitToAdmin } = require('../config/socket');
        if (mr.manager_id) {
          emitToManager(mr.manager_id, 'checkin_completed', {
            employeeId: mr.employee_id,
            employeeName: mr.emp_name,
            cyclePhase,
            message: `${mr.emp_name} has completed their check-in for ${cyclePhase}`
          });
          emitToManager(mr.manager_id, 'new_notification', {
            type: 'CHECKIN_COMPLETED',
            message: `${mr.emp_name} has completed their check-in for ${cyclePhase}`,
            relatedId: goalId
          });
        }
        emitToAdmin('checkin_completed', {
          employeeId: mr.employee_id,
          employeeName: mr.emp_name,
          cyclePhase,
          message: `${mr.emp_name} has completed their check-in for ${cyclePhase}`
        });
      }
    } catch (emailErr) {
      console.error('Checkin email and socket notifications failed:', emailErr.message);
    }

    res.json({ checkin: result.rows[0], progressScore: score });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getMyProgress = async (req, res) => {
  const { cyclePhase } = req.query;

  try {
    const result = await pool.query(
      `SELECT g.id AS goal_id, g.title, g.uom_type, g.target_value, g.target_date, g.weightage,
              ta.name AS thrust_area,
              c.cycle_phase, c.actual_value, c.actual_date, c.status,
              c.progress_score, c.employee_note, c.manager_comment, c.id AS checkin_id
       FROM goals g
       JOIN goal_sheets gs ON g.goal_sheet_id = gs.id
       LEFT JOIN thrust_areas ta ON g.thrust_area_id = ta.id
       LEFT JOIN checkins c ON c.goal_id = g.id ${cyclePhase ? 'AND c.cycle_phase = $2' : ''}
       WHERE gs.employee_id = $1 AND gs.status <> 'DRAFT'
       ORDER BY g.id`,
      cyclePhase ? [req.user.id, cyclePhase] : [req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { upsertCheckin, getMyProgress, computeScore };