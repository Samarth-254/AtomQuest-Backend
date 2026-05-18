require('dotenv').config();

const DEFAULT_SENDER_NAME = process.env.BREVO_SENDER_NAME || 'AtomQuest Portal';
const DEFAULT_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL;
const DEFAULT_REPLY_TO = process.env.BREVO_REPLY_TO || DEFAULT_SENDER_EMAIL;

const stripHtml = (html = '') =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const sendEmail = async ({
  to,
  toName,
  subject,
  html,
  text,
  replyTo,
  tags,
}) => {
  try {
    if (!process.env.BREVO_API_KEY) {
      throw new Error('BREVO_API_KEY is missing in environment variables');
    }

    if (!DEFAULT_SENDER_EMAIL) {
      throw new Error('BREVO_SENDER_EMAIL is missing in environment variables');
    }

    if (!to) {
      throw new Error('Recipient email (to) is required');
    }

    if (!subject) {
      throw new Error('Email subject is required');
    }

    if (!html && !text) {
      throw new Error('Either html or text content is required');
    }

    const payload = {
      sender: {
        name: DEFAULT_SENDER_NAME,
        email: DEFAULT_SENDER_EMAIL,
      },
      to: [
        {
          email: to,
          ...(toName ? { name: toName } : {}),
        },
      ],
      subject,
      htmlContent: html || undefined,
      textContent: text || stripHtml(html),
      replyTo: {
        email: replyTo || DEFAULT_REPLY_TO,
        name: DEFAULT_SENDER_NAME,
      },
      ...(tags && tags.length ? { tags } : {}),
    };

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    const raw = await response.text();
    let data = null;

    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = raw;
    }

    if (!response.ok) {
      throw new Error(
        `Brevo API error: ${response.status} ${
          typeof data === 'string' ? data : JSON.stringify(data)
        }`
      );
    }

    console.log(`Email sent to ${to}`, data);
    return data;
  } catch (err) {
    console.error('Email failed:', err.message);
    // Soft fail to prevent crashing the controller logic
    return null;
  }
};

const emailTemplates = {
  goalSubmitted: (employeeName, managerName) => ({
    subject: '📋 New Goal Sheet Submitted for Review',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;line-height:1.6;color:#1a202c">
        <h2 style="color:#1a365d">Goal Sheet Submitted</h2>
        <p>Hi <strong>${managerName}</strong>,</p>
        <p><strong>${employeeName}</strong> has submitted their goal sheet for your review and approval.</p>
        <p>Please log in to the AtomQuest Portal to review and take action.</p>
        <a href="${process.env.FRONTEND_URL}" style="background:#3182ce;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;display:inline-block;margin-top:10px">
          Review Goals
        </a>
        <p style="color:#718096;font-size:12px;margin-top:24px">AtomQuest Goal Tracking Portal</p>
      </div>
    `,
  }),

  goalApproved: (employeeName) => ({
    subject: '✅ Your Goal Sheet Has Been Approved',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;line-height:1.6;color:#1a202c">
        <h2 style="color:#276749">Goal Sheet Approved</h2>
        <p>Hi <strong>${employeeName}</strong>,</p>
        <p>Your goal sheet has been <strong>approved</strong>. Your goals are now locked for the cycle.</p>
        <a href="${process.env.FRONTEND_URL}" style="background:#38a169;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;display:inline-block;margin-top:10px">
          View Goals
        </a>
        <p style="color:#718096;font-size:12px;margin-top:24px">AtomQuest Goal Tracking Portal</p>
      </div>
    `,
  }),

  goalReturned: (employeeName, reason) => ({
    subject: '🔄 Your Goal Sheet Has Been Returned for Rework',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;line-height:1.6;color:#1a202c">
        <h2 style="color:#c05621">Goal Sheet Returned</h2>
        <p>Hi <strong>${employeeName}</strong>,</p>
        <p>Your goal sheet has been <strong>returned for rework</strong>.</p>
        <p><strong>Reason:</strong> ${reason}</p>
        <a href="${process.env.FRONTEND_URL}" style="background:#dd6b20;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;display:inline-block;margin-top:10px">
          Update Goals
        </a>
        <p style="color:#718096;font-size:12px;margin-top:24px">AtomQuest Goal Tracking Portal</p>
      </div>
    `,
  }),

  checkinReminder: (userName, phase) => ({
    subject: `⏰ Reminder: ${phase} Check-in Pending`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;line-height:1.6;color:#1a202c">
        <h2 style="color:#553c9a">Check-in Reminder</h2>
        <p>Hi <strong>${userName}</strong>,</p>
        <p>The <strong>${phase}</strong> check-in window is open. Please update your goal achievements in the portal.</p>
        <a href="${process.env.FRONTEND_URL}" style="background:#6b46c1;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;display:inline-block;margin-top:10px">
          Update Check-in
        </a>
        <p style="color:#718096;font-size:12px;margin-top:24px">AtomQuest Goal Tracking Portal</p>
      </div>
    `,
  }),

  escalationAlert: (userName, eventType, daysOverdue) => ({
    subject: `🚨 Escalation Alert: ${eventType}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;line-height:1.6;color:#1a202c">
        <h2 style="color:#c53030">Escalation Alert</h2>
        <p>This is an automated escalation alert from the AtomQuest Portal.</p>
        <p><strong>User:</strong> ${userName}</p>
        <p><strong>Issue:</strong> ${eventType}</p>
        <p><strong>Overdue by:</strong> ${daysOverdue} days</p>
        <a href="${process.env.FRONTEND_URL}" style="background:#e53e3e;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;display:inline-block;margin-top:10px">
          View in Portal
        </a>
        <p style="color:#718096;font-size:12px;margin-top:24px">AtomQuest Goal Tracking Portal — Automated Alert</p>
      </div>
    `,
  }),

  checkinSaved: (managerName, employeeName, phase) => ({
    subject: `📊 ${employeeName} submitted ${phase} check-in`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;line-height:1.6;color:#1a202c">
        <h2 style="color:#553c9a">Check-in Submitted</h2>
        <p>Hi <strong>${managerName}</strong>,</p>
        <p><strong>${employeeName}</strong> has submitted their <strong>${phase}</strong> quarterly check-in with updated achievement data.</p>
        <p>Please review their progress in the portal and add your check-in comments.</p>
        <a href="${process.env.FRONTEND_URL}" style="background:#6b46c1;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;display:inline-block;margin-top:10px">
          Review Check-in
        </a>
        <p style="color:#718096;font-size:12px;margin-top:24px">AtomQuest Goal Tracking Portal</p>
      </div>
    `,
  }),

  goalUnlockedByAdmin: (employeeName) => ({
    subject: '🔓 Your Goal Sheet Has Been Unlocked by Admin',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;line-height:1.6;color:#1a202c">
        <h2 style="color:#2b6cb0">Goal Sheet Unlocked</h2>
        <p>Hi <strong>${employeeName}</strong>,</p>
        <p>Your goal sheet has been <strong>unlocked by your HR Admin</strong>. You can now edit your goals and re-submit for manager approval.</p>
        <a href="${process.env.FRONTEND_URL}" style="background:#3182ce;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;display:inline-block;margin-top:10px">
          Edit Goals
        </a>
        <p style="color:#718096;font-size:12px;margin-top:24px">AtomQuest Goal Tracking Portal</p>
      </div>
    `,
  }),
  userAdded: (employeeName, email, password, role) => ({
    subject: '🎉 Welcome to AtomQuest Portal — Account Created',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;line-height:1.6;color:#1a202c">
        <h2 style="color:#2c5282">Welcome to AtomQuest, ${employeeName}!</h2>
        <p>Your administrative account has been created successfully.</p>
        <p><strong>Login Details:</strong></p>
        <ul>
          <li><strong>Email:</strong> ${email}</li>
          <li><strong>Password:</strong> ${password}</li>
          <li><strong>Role:</strong> ${role}</li>
        </ul>
        <p>Please log in using the button below and configure your goals.</p>
        <a href="${process.env.FRONTEND_URL}" style="background:#2b6cb0;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;display:inline-block;margin-top:10px">
          Log In to Portal
        </a>
        <p style="color:#718096;font-size:12px;margin-top:24px">AtomQuest Goal Tracking Portal</p>
      </div>
    `,
  }),
  userSuspendedStatus: (employeeName, isSuspended) => ({
    subject: isSuspended ? '⚠️ Your AtomQuest Account Has Been Suspended' : '✅ Your AtomQuest Account Has Been Reinstated',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;line-height:1.6;color:#1a202c">
        <h2 style="color:${isSuspended ? '#c53030' : '#2f855a'}">Account Status Update</h2>
        <p>Hi <strong>${employeeName}</strong>,</p>
        <p>Your AtomQuest account has been <strong>${isSuspended ? 'suspended' : 'reinstated'}</strong> by the system administrator.</p>
        ${isSuspended 
          ? '<p>You will no longer be able to log into the portal. If you believe this is in error, please contact your HR Admin.</p>' 
          : '<p>You can now log in using your normal credentials and resume accessing your goals.</p>'
        }
        ${!isSuspended ? `
        <a href="${process.env.FRONTEND_URL}" style="background:#2f855a;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;display:inline-block;margin-top:10px">
          Log In to Portal
        </a>` : ''}
        <p style="color:#718096;font-size:12px;margin-top:24px">AtomQuest Goal Tracking Portal</p>
      </div>
    `,
  }),
  userDeleted: (employeeName) => ({
    subject: '❌ Your AtomQuest Account Has Been Removed',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;line-height:1.6;color:#1a202c">
        <h2 style="color:#c53030">Account Removed</h2>
        <p>Hi <strong>${employeeName}</strong>,</p>
        <p>Your AtomQuest account has been permanently <strong>removed</strong> by the system administrator.</p>
        <p>Your goal sheets and check-in history have been archived. You will no longer be able to log in.</p>
        <p style="color:#718096;font-size:12px;margin-top:24px">AtomQuest Goal Tracking Portal</p>
      </div>
    `,
  }),
  checkinCommentAdded: (employeeName, managerName, goalTitle, comment) => ({
    subject: '💬 New Check-in Comment from Manager',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;line-height:1.6;color:#1a202c">
        <h2 style="color:#2b6cb0">Check-in Comment Received</h2>
        <p>Hi <strong>${employeeName}</strong>,</p>
        <p>Your manager <strong>${managerName}</strong> has added a comment on your check-in for goal: <strong>"${goalTitle}"</strong>.</p>
        <div style="background:#f7fafc;border-left:4px solid #4299e1;padding:12px;margin:15px 0;font-style:italic">
          "${comment}"
        </div>
        <a href="${process.env.FRONTEND_URL}" style="background:#3182ce;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;display:inline-block;margin-top:10px">
          View in Portal
        </a>
        <p style="color:#718096;font-size:12px;margin-top:24px">AtomQuest Goal Tracking Portal</p>
      </div>
    `,
  }),
  kpiBroadcasted: (employeeName, kpiTitle) => ({
    subject: '📢 New Departmental KPI Broadcasted',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;line-height:1.6;color:#1a202c">
        <h2 style="color:#c05621">New KPI Assigned</h2>
        <p>Hi <strong>${employeeName}</strong>,</p>
        <p>Your manager has broadcasted a departmental KPI: <strong>"${kpiTitle}"</strong>.</p>
        <p>This read-only KPI has been automatically added to your active goal sheet with a default 10% weightage. Please adjust your other goal weightages as needed to ensure the total is 100%.</p>
        <a href="${process.env.FRONTEND_URL}" style="background:#dd6b20;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;display:inline-block;margin-top:10px">
          View Goal Sheet
        </a>
        <p style="color:#718096;font-size:12px;margin-top:24px">AtomQuest Goal Tracking Portal</p>
      </div>
    `,
  }),
  passwordReset: (employeeName, resetLink) => ({
    subject: '🔒 Reset Your AtomQuest Password',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;line-height:1.6;color:#1a202c">
        <h2 style="color:#2b6cb0">Password Reset Request</h2>
        <p>Hi <strong>${employeeName}</strong>,</p>
        <p>We received a request to reset your AtomQuest password. Click the button below to set a new password.</p>
        <a href="${resetLink}" style="background:#2b6cb0;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;display:inline-block;margin-top:10px">
          Reset Password
        </a>
        <p style="color:#718096;font-size:12px;margin-top:24px">If you did not request this, you can safely ignore this email.</p>
        <p style="color:#718096;font-size:12px;margin-top:12px">AtomQuest Goal Tracking Portal</p>
      </div>
    `,
  }),
};

module.exports = { sendEmail, emailTemplates };