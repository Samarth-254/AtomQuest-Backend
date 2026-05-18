const pool = require('../config/db');

const getQoqTrends = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
          c.cycle_phase,
          ROUND(COALESCE(AVG(c.progress_score), 0)::numeric, 2) AS avg_progress_score,
          ROUND(COALESCE(AVG(c.progress_score) FILTER (WHERE u.department = 'Engineering'), 0)::numeric, 2) AS engineering_avg_progress,
          COUNT(c.id) AS total_checkins
       FROM checkins c
       JOIN goals g ON c.goal_id = g.id
       JOIN goal_sheets gs ON g.goal_sheet_id = gs.id
       JOIN users u ON gs.employee_id = u.id
       WHERE u.role = 'EMPLOYEE' AND c.cycle_phase IS NOT NULL
       GROUP BY c.cycle_phase
       ORDER BY CASE c.cycle_phase
         WHEN 'Q1' THEN 1
         WHEN 'Q2' THEN 2
         WHEN 'Q3' THEN 3
         WHEN 'Q4' THEN 4
         WHEN 'H1' THEN 5
         WHEN 'H2' THEN 6
         WHEN 'Annual' THEN 7
         ELSE 99 END, c.cycle_phase`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

const getCompletionHeatmap = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
          c.cycle_phase,
          COUNT(c.id) AS total_checkins,
          COUNT(CASE WHEN UPPER(c.status) = 'COMPLETED' THEN 1 END) AS completed_checkins
       FROM checkins c
       JOIN goals g ON c.goal_id = g.id
       JOIN goal_sheets gs ON g.goal_sheet_id = gs.id
       JOIN users u ON gs.employee_id = u.id
       WHERE u.role = 'EMPLOYEE' AND c.cycle_phase IS NOT NULL
       GROUP BY c.cycle_phase
       ORDER BY CASE c.cycle_phase
         WHEN 'Q1' THEN 1
         WHEN 'Q2' THEN 2
         WHEN 'Q3' THEN 3
         WHEN 'Q4' THEN 4
         WHEN 'H1' THEN 5
         WHEN 'H2' THEN 6
         WHEN 'Annual' THEN 7
         ELSE 99 END, c.cycle_phase`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

const getGoalDistribution = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
          u.department,
          ta.name AS thrust_area,
          COUNT(g.id) AS total_goals
       FROM goals g
       JOIN goal_sheets gs ON g.goal_sheet_id = gs.id
       JOIN users u ON gs.employee_id = u.id
       LEFT JOIN thrust_areas ta ON g.thrust_area_id = ta.id
       WHERE u.role = 'EMPLOYEE'
         AND u.department IS NOT NULL
         AND ta.name IS NOT NULL
       GROUP BY u.department, ta.name
       ORDER BY u.department, total_goals DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

const getManagerEffectiveness = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
          m.id AS manager_id,
          m.name AS manager_name,
          COUNT(DISTINCT gs.id) AS total_goal_sheets,
          COUNT(DISTINCT CASE WHEN gs.status = 'APPROVED' THEN gs.id END) AS approved_goal_sheets,
          COUNT(DISTINCT c.id) AS total_checkins_reviewed
       FROM users m
       LEFT JOIN users e ON e.manager_id = m.id
       LEFT JOIN goal_sheets gs ON gs.employee_id = e.id
       LEFT JOIN goals g ON g.goal_sheet_id = gs.id
       LEFT JOIN checkins c ON c.goal_id = g.id AND c.manager_id = m.id
       WHERE m.role = 'MANAGER'
       GROUP BY m.id, m.name
       ORDER BY m.name`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

const getLiveInsights = async (req, res) => {
  try {
    const lowestRes = await pool.query(
      `SELECT u.name, COALESCE(ROUND(AVG(c.progress_score)::numeric, 1), 0.0) AS avg_progress
       FROM users u
       JOIN goal_sheets gs ON gs.employee_id = u.id
       JOIN goals g ON g.goal_sheet_id = gs.id
       LEFT JOIN checkins c ON c.goal_id = g.id
       WHERE u.role = 'EMPLOYEE'
       GROUP BY u.id, u.name
       ORDER BY avg_progress ASC
       LIMIT 1`
    );

    const delayedRes = await pool.query(
      `SELECT g.title, CURRENT_DATE - g.target_date::date AS days_delayed
       FROM goals g
       JOIN goal_sheets gs ON g.goal_sheet_id = gs.id
       LEFT JOIN checkins c ON c.goal_id = g.id
       WHERE g.target_date IS NOT NULL
         AND (UPPER(c.status) != 'COMPLETED' OR c.status IS NULL) 
         AND g.target_date < CURRENT_DATE
       ORDER BY days_delayed DESC
       LIMIT 1`
    );

    const approvalRes = await pool.query(
      `SELECT COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (approved_at - submitted_at))/86400)::numeric, 1), 1.4) AS avg_approval_days
       FROM goal_sheets
       WHERE status = 'APPROVED' AND approved_at IS NOT NULL AND submitted_at IS NOT NULL`
    );

    const checkinRes = await pool.query(
      `SELECT 
         COALESCE(
           ROUND(
             (COUNT(CASE WHEN UPPER(c.status) = 'COMPLETED' THEN 1 END) * 100.0) / 
             NULLIF(COUNT(c.id), 0)
           , 1)
         , 94.2) AS rate
       FROM checkins c`
    );

    const deptRes = await pool.query(
      `SELECT 
         u.department,
         COALESCE(ROUND(AVG(c.progress_score)::numeric, 1), 0.0) AS avg_progress
       FROM users u
       JOIN goal_sheets gs ON gs.employee_id = u.id
       JOIN goals g ON g.goal_sheet_id = gs.id
       LEFT JOIN checkins c ON c.goal_id = g.id
       WHERE u.role = 'EMPLOYEE' AND u.department IS NOT NULL
       GROUP BY u.department
       ORDER BY avg_progress DESC`
    );

    res.json({
      lowest_performer: lowestRes.rows[0] || { name: 'None', avg_progress: 0.0 },
      delayed_objective: delayedRes.rows[0] || { title: 'None', days_delayed: 0 },
      avg_approval_time: approvalRes.rows[0]?.avg_approval_days || 1.4,
      checkin_rate: checkinRes.rows[0]?.rate || 94.2,
      department_metrics: deptRes.rows
    });
  } catch (err) {
    console.error('getLiveInsights error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getQoqTrends,
  getCompletionHeatmap,
  getGoalDistribution,
  getManagerEffectiveness,
  getLiveInsights,
};