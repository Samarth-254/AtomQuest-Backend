const cron = require('node-cron');
const pool = require('../config/db');
const { sendEmail, emailTemplates } = require('../config/email');

const runEscalationChecks = async () => {
  try {
    console.log('Running escalation job...');

    const rulesRes = await pool.query(
      `SELECT * FROM escalation_rules WHERE is_active = TRUE`
    );

    const rules = rulesRes.rows;

    for (const rule of rules) {
      if (rule.trigger_event === 'GOAL_NOT_SUBMITTED') {
        const overdueUsers = await pool.query(
          `SELECT u.id, u.name, u.email, m.email AS manager_email
           FROM users u
           LEFT JOIN users m ON u.manager_id = m.id
           WHERE u.role = 'EMPLOYEE'
             AND NOT EXISTS (
               SELECT 1 FROM goal_sheets gs WHERE gs.employee_id = u.id
             )`
        );

        for (const user of overdueUsers.rows) {
          const recipients = [];

          if (rule.notify_employee && user.email) recipients.push(user.email);
          if (rule.notify_manager && user.manager_email) recipients.push(user.manager_email);

          for (const email of recipients) {
            const tpl = emailTemplates.escalationAlert(
              user.name,
              'Goal sheet not submitted',
              rule.days_threshold
            );
            await sendEmail({ to: email, ...tpl });
          }

          await pool.query(
            `INSERT INTO escalation_logs (rule_id, triggered_for, event_type, message, notified_to)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              rule.id,
              user.id,
              rule.trigger_event,
              'Goal sheet not submitted',
              recipients.join(', '),
            ]
          );
        }
      }

      if (rule.trigger_event === 'GOAL_NOT_APPROVED') {
        const overdueSheets = await pool.query(
          `SELECT gs.id, u.id AS employee_id, u.name, u.email, m.email AS manager_email
           FROM goal_sheets gs
           JOIN users u ON gs.employee_id = u.id
           LEFT JOIN users m ON u.manager_id = m.id
           WHERE gs.status = 'SUBMITTED'
             AND gs.submitted_at < NOW() - ($1 || ' days')::interval`,
          [rule.days_threshold]
        );

        for (const sheet of overdueSheets.rows) {
          const recipients = [];
          if (rule.notify_manager && sheet.manager_email) recipients.push(sheet.manager_email);
          if (rule.notify_employee && sheet.email) recipients.push(sheet.email);

          for (const email of recipients) {
            const tpl = emailTemplates.escalationAlert(
              sheet.name,
              'Goal sheet approval pending',
              rule.days_threshold
            );
            await sendEmail({ to: email, ...tpl });
          }

          await pool.query(
            `INSERT INTO escalation_logs (rule_id, triggered_for, event_type, message, notified_to)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              rule.id,
              sheet.employee_id,
              rule.trigger_event,
              'Goal sheet approval pending',
              recipients.join(', '),
            ]
          );
        }
      }

      if (rule.trigger_event === 'CHECKIN_MISSING') {
        const pendingCheckins = await pool.query(
          `SELECT DISTINCT u.id, u.name, u.email, m.email AS manager_email
           FROM users u
           JOIN goal_sheets gs ON gs.employee_id = u.id
           JOIN goals g ON g.goal_sheet_id = gs.id
           LEFT JOIN users m ON u.manager_id = m.id
           WHERE u.role = 'EMPLOYEE'
             AND gs.status = 'APPROVED'
             AND NOT EXISTS (
               SELECT 1 FROM checkins c WHERE c.goal_id = g.id
             )`
        );

        for (const user of pendingCheckins.rows) {
          const recipients = [];
          if (rule.notify_employee && user.email) recipients.push(user.email);
          if (rule.notify_manager && user.manager_email) recipients.push(user.manager_email);

          for (const email of recipients) {
            const tpl = emailTemplates.escalationAlert(
              user.name,
              'Quarterly check-in missing',
              rule.days_threshold
            );
            await sendEmail({ to: email, ...tpl });
          }

          await pool.query(
            `INSERT INTO escalation_logs (rule_id, triggered_for, event_type, message, notified_to)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              rule.id,
              user.id,
              rule.trigger_event,
              'Quarterly check-in missing',
              recipients.join(', '),
            ]
          );
        }
      }
    }

    console.log('Escalation job completed');
  } catch (err) {
    console.error('Escalation job failed:', err.message);
  }
};

const startEscalationJob = () => {
  cron.schedule('0 9 * * *', async () => {
    await runEscalationChecks();
  });

  console.log('Escalation cron scheduled for every day at 9:00 AM');
};

module.exports = { startEscalationJob, runEscalationChecks };