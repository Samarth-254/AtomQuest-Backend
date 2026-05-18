const pool = require('../config/db');
const XLSX = require('xlsx');

const exportAchievementReport = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
          u.name AS employee_name,
          u.email AS employee_email,
          u.department,
          m.name AS manager_name,
          gc.cycle_name,
          g.title AS goal_title,
          g.description AS goal_description,
          g.uom_type,
          g.target_value,
          g.target_date,
          g.weightage,
          c.cycle_phase,
          c.actual_value,
          c.actual_date,
          c.status,
          c.progress_score,
          c.manager_comment
       FROM goals g
       JOIN goal_sheets gs ON g.goal_sheet_id = gs.id
       JOIN users u ON gs.employee_id = u.id
       LEFT JOIN users m ON u.manager_id = m.id
       JOIN goal_cycles gc ON gs.cycle_id = gc.id
       LEFT JOIN checkins c ON c.goal_id = g.id
       ORDER BY u.name, g.id, c.cycle_phase`
    );

    const data = result.rows;

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Achievement Report');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader(
      'Content-Disposition',
      'attachment; filename=achievement-report.xlsx'
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const exportCompletionReport = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
          u.name AS employee_name,
          u.email,
          u.department,
          m.name AS manager_name,
          gs.status AS goal_sheet_status,
          gs.submitted_at,
          gs.approved_at,
          COUNT(DISTINCT g.id) AS total_goals,
          COUNT(DISTINCT c.id) AS total_checkins
       FROM users u
       LEFT JOIN users m ON u.manager_id = m.id
       LEFT JOIN goal_sheets gs ON gs.employee_id = u.id
       LEFT JOIN goals g ON g.goal_sheet_id = gs.id
       LEFT JOIN checkins c ON c.goal_id = g.id
       WHERE u.role = 'EMPLOYEE'
       GROUP BY u.id, m.name, gs.id
       ORDER BY u.name`
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  exportAchievementReport,
  exportCompletionReport,
};