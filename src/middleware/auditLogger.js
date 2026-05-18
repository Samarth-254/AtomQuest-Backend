const pool = require('../config/db');

const logAudit = async ({ tableName, recordId, action, changedBy, oldValues, newValues }) => {
  try {
    await pool.query(
      `INSERT INTO audit_logs (table_name, record_id, action, changed_by, old_values, new_values)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        tableName,
        recordId,
        action,
        changedBy,
        oldValues ? JSON.stringify(oldValues) : null,
        newValues ? JSON.stringify(newValues) : null,
      ]
    );
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
};

module.exports = { logAudit };