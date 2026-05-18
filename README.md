# 🚀 AtomQuest 1.0 — Goal Setting & Tracking Portal

[![React](https://img.shields.io/badge/Frontend-React%2019-0F8B83?style=for-the-badge&logo=react)](https://react.dev)
[![TailwindCSS](https://img.shields.io/badge/Styling-Tailwind%20v4-38bdf8?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com)
[![Express](https://img.shields.io/badge/Backend-Express.js-000000?style=for-the-badge&logo=express)](https://expressjs.com)
[![PostgreSQL](https://img.shields.io/badge/Database-Neon%20Postgres-336791?style=for-the-badge&logo=postgresql)](https://neon.tech)
[![Socket.io](https://img.shields.io/badge/Realtime-Socket.io-010101?style=for-the-badge&logo=socket.io)](https://socket.io)

AtomQuest is a premium, enterprise-grade **In-House Goal Setting & Tracking Portal** built to align, track, and optimize performance across departments. Designed for **Atomberg**, the portal provides three custom-tailored user journeys (Employees, L1 Managers, and HR/Admin) to draft goal sheets, enforce compliance validations, log quarterly achievements, review progress through visual dashboards, and execute automated rule-based escalations.

---

## 🔑 Hackathon Sandbox Access & Demo Credentials

To make evaluation as seamless as possible, we have seeded a complete departmental hierarchy. All credentials map to the production database hosted on Neon Postgres, and the password for **all** accounts is **`password123`**.

| Name | Role | Department | Email Address | Password | Org Context / Reporting Line |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Admin HR** | `ADMIN` | HR | `admin@atomberg.com` | `password123` | Master configuration rights, Exception unlocks, Global Audit Trails |
| **Rajesh Kumar** | `MANAGER` | Sales | `rajesh@atomberg.com` | `password123` | L1 Manager. Manages Priya Sharma & Manoj Gaur |
| **Priya Sharma** | `EMPLOYEE` | Sales | `priya@atomberg.com` | `password123` | Employee under Rajesh Kumar |
| **Manoj Gaur** | `EMPLOYEE` | Engineering | `manoj@atomberg.com` | `password123` | Employee under Rajesh Kumar |
| **Aarav Mehta** | `MANAGER` | Engineering | `aarav@atomberg.com` | `password123` | L1 Manager for Engineering |
| **Nisha Rao** | `MANAGER` | Sales | `nisha@atomberg.com` | `password123` | L1 Manager for Sales |

---

## 🏗️ System Architecture & Workflow

```mermaid
graph TD
    %% Frontend Subsystem
    subgraph Frontend ["Client Layer (React 19 & Tailwind v4)"]
        A[LoginPage] --> B{Role Router}
        B -- Employee Role --> C[Employee Dashboard / Goal Builder]
        B -- L1 Manager Role --> D[Manager Dashboard / Team Review]
        B -- Admin HR Role --> E[Admin Dashboard / Cycle & Audit Logs]
    end

    %% State and Network
    C & D & E -->|Zustand & Axios Client| F[Express.js Gateway / JWT Auth]

    %% Backend Subsystem
    subgraph Backend ["Server Layer (Express & Node.js)"]
        F --> G[controllers/authController.js]
        F --> H[controllers/goalController.js]
        F --> I[controllers/managerController.js]
        F --> J[controllers/checkinController.js]
        F --> K[controllers/adminController.js]
        F --> L[controllers/analyticsController.js]
    end

    %% Live Communications & Jobs
    subgraph Realtime ["Async Services"]
        M[Socket.io Real-time Feed]
        N[node-cron Escalation Runner]
        O[Brevo SMTP Email Service]
    end

    Backend -->|Socket Broadcast| M
    N -->|Checks Deadlines| Backend
    Backend -->|Sends Notifications| O

    %% Database Subsystem
    subgraph Storage ["Database Layer (Serverless Postgres)"]
        P[(Neon PostgreSQL Cluster)]
    end

    Backend -->|Connection Pool - pg| P
```

---

## ⚡ BRD Phase Mapping & Features Implemented

Every single requirement detailed in the BRD has been implemented with visual polish and absolute functional precision.

### 📋 Phase 1: Goal Creation & Approval (Must-Have)
- **Interactive Goal Sheet Builder (`GoalSheetBuilder.jsx`)**: Employees can pick key **Thrust Areas** (e.g. Sales Revenue, Operational Excellence, TAT Reduction), enter a title, details, and configure the target.
- **Dynamic Weightage Validations**: System strictly validates goal sheets before submission:
  - Total weightage across all goals **must equal exactly 100%**.
  - Minimum weightage for any individual goal is **10%**.
  - Maximum of **8 goals** can be created per cycle.
- **L1 Manager Review & Inline Modification (`SheetReview.jsx`)**: Managers can view submitted goal sheets, edit targets/weightages inline, and either approve or return the sheet for rework. On approval, the sheet is **locked**, preventing further modifications.
- **Shared KPIs Broadcast (`SharedGoals.jsx`)**: Managers or Admins can push departmental KPIs to multiple employees. Recipients see these read-only goals (Title and Target locked) and can only modify their weightage. Achievement updates sync automatically across all linked employee sheets.

### 📈 Phase 2: Achievement Tracking & Quarterly Check-ins (Must-Have)
- **Quarterly Progress Submission (`CheckinPage.jsx`)**: Employees can log planned targets vs. actual achievements, adjusting the status to **Not Started**, **On Track**, or **Completed**.
- **Visual Progress Formulas**: Progress scores are dynamically calculated using strict BRD UoM definitions:
  - **Min (Higher is Better)**: `Achievement ÷ Target`
  - **Max (Lower is Better)**: `Target ÷ Achievement`
  - **Timeline (Date-Based)**: Evaluates deadline compliance and displays date differences.
  - **Zero-Based (Zero = Success)**: Returns `100%` if actual is `0`, otherwise `0%`.
- **Manager Feedback Logs (`CheckinReview.jsx`)**: Managers can review the planned vs. actual achievements for each team member and add structured check-in comments.

### 📅 Check-in Schedule Enforcement
The portal enforces the active quarterly capture window:
- **May 1st**: Goal Setting & Submission Cycle
- **July**: Q1 Progress Update
- **October**: Q2 Progress Update
- **January**: Q3 Progress Update
- **March / April**: Q4 Final Achievement Capture

---

## 🌟 Good-to-Have Features Implemented (Bonus Credit)

We didn't just build the bare minimum — we incorporated all advanced requirements to differentiate our solution!

### 1. 📧 Brevo SMTP & Real-Time Socket Notifications
- Fully integrated with the **Brevo SMTP API** to dispatch highly professional, branded HTML transaction emails on key lifecycle events.
- Leverages **Socket.io** to push real-time alerts directly into the portal UI (e.g., when a manager adds a check-in comment or approves a sheet, a banner pops up instantly).

### 2. 🚨 Rule-Based Escalation Module (`EscalationLogs.jsx`)
- Automated escalation rules run in the background (via **node-cron**).
- Admins can configure individual rule thresholds (e.g., *Employee hasn't submitted goals within N days* or *Manager hasn't approved check-in within N days*).
- Logs escalations, tracks overdue counts, and fires automated skip-level alert emails to employees, managers, or HR.

### 3. 📊 High-Fidelity Analytics & Goal Distribution Heatmap (`Analytics.jsx`)
- **Interactive KPI Cards**: Real-time display of average achievement scores, active goals, and pending submissions.
- **Manager Performance Redlines**: Automatically highlights the lowest-performing employee, the most delayed objective, average manager approval times, and overall check-in rates.
- **SVG Line Graph**: Renders Quarter-on-Quarter (QoQ) performance indicators and department-level trends.
- **Dynamic Heatmap**: Renders a category vs. department distribution matrix, showing where organizational focus lies.

---

## 📬 Hackathon Testing Guide: Email Notifications

Because the sandbox emails listed in the database (`admin@atomberg.com`, `priya@atomberg.com`, etc.) are corporate-mocked, **physical emails cannot be delivered to these mailboxes**. However, our email service is **100% production-ready** and integrated via the Brevo SMTP API.

Here is how you can verify and review this system during evaluation:

### 1. Verification via Backend Terminal Logs
Every time a user performs an action that triggers an email, the backend connects securely to Brevo, sends the payload, and logs the API confirmation to the console. Look for these statements in your backend terminal:
```bash
# Example Console Log Output on Goal Submission:
Email sent to rajesh@atomberg.com { messageId: "<202605190226.541278@smtp-billing.brevo.com>" }
```
If an email fails to deliver (e.g. invalid domain setup), the backend logs a **soft-fail message** so the user flow is never disrupted:
```bash
Email notification error: Brevo API error: 400 Recipient domain is not configured...
```

### 2. High-Fidelity Email Template Previews
Below are previews of the exact HTML templates generated by `email.js` and dispatched to mock users. Click each dropdown to view the layout:

<details>
<summary>📋 Goal Sheet Submitted Alert (Sent to Manager)</summary>

```html
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; line-height: 1.6; color: #1a202c; border: 1px solid #e2e8f0; padding: 24px; border-radius: 8px;">
  <h2 style="color: #1a365d; margin-top: 0;">📋 New Goal Sheet Submitted</h2>
  <p>Hi <strong>Rajesh Kumar</strong>,</p>
  <p><strong>Priya Sharma</strong> has submitted their goal sheet for your review and approval.</p>
  <p>Please log in to the AtomQuest Portal to review and take action.</p>
  <a href="http://localhost:5173" style="background: #3182ce; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px; font-weight: bold;">
    Review Goals
  </a>
  <p style="color: #718096; font-size: 12px; margin-top: 24px; border-top: 1px solid #edf2f7; padding-top: 12px;">
    AtomQuest Goal Tracking Portal — Automated HR System
  </p>
</div>
```
</details>

<details>
<summary>🔄 Goal Sheet Returned for Rework (Sent to Employee)</summary>

```html
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; line-height: 1.6; color: #1a202c; border: 1px solid #e2e8f0; padding: 24px; border-radius: 8px;">
  <h2 style="color: #c05621; margin-top: 0;">🔄 Goal Sheet Returned</h2>
  <p>Hi <strong>Priya Sharma</strong>,</p>
  <p>Your goal sheet has been <strong>returned for rework</strong>.</p>
  <p style="background: #fffaf0; border-left: 4px solid #dd6b20; padding: 12px; margin: 16px 0; font-style: italic;">
    <strong>Reason:</strong> Please adjust your thrust area target for Sales Revenue. We are targeting a 20% growth, not 15%.
  </p>
  <a href="http://localhost:5173" style="background: #dd6b20; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px; font-weight: bold;">
    Update Goals
  </a>
  <p style="color: #718096; font-size: 12px; margin-top: 24px; border-top: 1px solid #edf2f7; padding-top: 12px;">
    AtomQuest Goal Tracking Portal — Automated HR System
  </p>
</div>
```
</details>

<details>
<summary>🚨 Rule-Based Escalation Alert (Skip-Level / HR Notification)</summary>

```html
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; line-height: 1.6; color: #1a202c; border: 1px solid #e2e8f0; padding: 24px; border-radius: 8px;">
  <h2 style="color: #c53030; margin-top: 0;">🚨 Escalation Alert</h2>
  <p>This is an automated escalation alert from the AtomQuest Portal.</p>
  <div style="background: #fff5f5; border-left: 4px solid #e53e3e; padding: 12px; margin: 16px 0;">
    <p style="margin: 4px 0;"><strong>Employee:</strong> Manoj Gaur</p>
    <p style="margin: 4px 0;"><strong>Issue:</strong> Goal Sheet Submission Overdue</p>
    <p style="margin: 4px 0;"><strong>Overdue Threshold:</strong> 5 Days Overdue</p>
  </div>
  <a href="http://localhost:5173" style="background: #e53e3e; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px; font-weight: bold;">
    View in Portal
  </a>
  <p style="color: #718096; font-size: 12px; margin-top: 24px; border-top: 1px solid #edf2f7; padding-top: 12px;">
    AtomQuest Goal Tracking Portal — Automated Escalation Service
  </p>
</div>
```
</details>

---

## 🛠️ Local Installation & Development Setup

Follow these simple steps to run the full stack portal locally in a sandbox environment.

### 📥 1. Clone the Codebases
Ensure you have the backend and frontend folders placed side-by-side:
```bash
# Directory Structure:
# ├── atomquest-backend/
# └── atomquest-frontend/
```

### ⚙️ 2. Configure Backend Env (`atomquest-backend/.env`)
Create a `.env` file in `atomquest-backend/` and configure:
```env
PORT=3000
DATABASE_URL=postgresql://neondb_owner:wispy-flower-aogpmcf7@br-wispy-flower-aogpmcf7-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
JWT_SECRET=supersecretjwttokenatomquest123!
FRONTEND_URL=http://localhost:5173

# Brevo SMTP Configuration
BREVO_API_KEY=xkeysib-your-custom-brevo-api-key-here
BREVO_SENDER_NAME="AtomQuest Portal"
BREVO_SENDER_EMAIL=portal-alerts@atomberg.com
```

### ⚙️ 3. Configure Frontend Env (`atomquest-frontend/.env`)
Create a `.env` file in `atomquest-frontend/` and configure:
```env
VITE_API_URL=http://localhost:3000/api
VITE_SOCKET_URL=http://localhost:3000
```

### 🚀 4. Install Dependencies & Run Server (Backend)
```bash
cd atomquest-backend
npm install
npm run dev
```
*You should see: `PostgreSQL connected (Neon)` and `AtomQuest backend running on port 3000`.*

### 🚀 5. Install Dependencies & Run Client (Frontend)
```bash
cd ../atomquest-frontend
npm install
npm run dev
```
*Vite will start the client, typically on `http://localhost:5173`.*

---

## 🏆 Hackathon Quality Highlights (Why AtomQuest Wins)

1. **Visually Stunning UX**: Standardized Inter fonts, sleeker badges, customized interactive SVGs for progress graphs, dark mode overlays, and highly responsive transitions.
2. **Neon Connection Pooling**: Configured serverless database connection limits to guarantee high availability and prevent performance degradation during peak query volume.
3. **Local CSV Processing**: Exports detailed achievement lists and audit trails directly via the browser client, conserving backend resources and optimizing operational costs.
4. **Resilient Communication**: Built-in real-time socket updates combined with a structured email fallback so employees are always aligned with their managers.

---
*Created with ❤️ by Team AtomQuest for the Atomberg Hackathon 1.0.*
