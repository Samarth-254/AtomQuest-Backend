# AtomQuest Backend

<div align="center">

![AtomQuest](https://img.shields.io/badge/AtomQuest-Goal%20Tracking%20Portal-blue?style=for-the-badge)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-green?style=for-the-badge&logo=nodedotjs)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-336791?style=for-the-badge&logo=postgresql)
![Express](https://img.shields.io/badge/Express-4.18-black?style=for-the-badge&logo=express)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8-white?style=for-the-badge&logo=socketdotio)
![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)

**A production-grade REST API + real-time backend for a corporate Goal Setting & Tracking Portal built during a hackathon.**  
Supports multi-role workflows (Employee → Manager → Admin), quarterly check-ins, automated escalations, and Excel report exports.

</div>

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [System Architecture](#system-architecture)
- [Database Schema](#database-schema)
- [Folder Structure](#folder-structure)
- [API Reference](#api-reference)
  - [Auth Routes](#auth-routes-apiauth)
  - [Goal Routes](#goal-routes-apigoals)
  - [Manager Routes](#manager-routes-apimanager)
  - [Check-in Routes](#check-in-routes-apicheckins)
  - [Admin Routes](#admin-routes-apiadmin)
  - [Analytics Routes](#analytics-routes-apianalytics)
  - [Reports Routes](#reports-routes-apireports)
  - [Notification Routes](#notification-routes-apinotifications)
- [Role-Based Access Control](#role-based-access-control)
- [Real-Time Events (Socket.IO)](#real-time-events-socketio)
- [Email System (Brevo)](#email-system-brevo)
- [Escalation Cron Job](#escalation-cron-job)
- [Scoring Algorithm](#scoring-algorithm)
- [Audit Logging](#audit-logging)
- [Environment Variables](#environment-variables)
- [Local Development](#local-development)
- [Deployment](#deployment)

---

## Overview

AtomQuest Backend powers a **hackathon-built corporate goal management platform** built for ZS Associates' campus challenge. The system enables:

- **Employees** to create, manage, and submit goal sheets per cycle
- **Managers** to review, approve, or return employee goals and leave check-in comments
- **Admins** to administer the full system — users, cycles, escalation rules, audit logs, and bulk reports
- **Automated escalations** via a daily cron job that detects stale submissions and notifies stakeholders
- **Real-time notifications** pushed via Socket.IO when goal sheets are submitted, approved, or returned
- **Analytics dashboards** backed by complex PostgreSQL aggregation queries for QoQ trends, heatmaps, and department-level insights

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js 18+ |
| **Framework** | Express.js 4.18 |
| **Database** | PostgreSQL (Neon Serverless) |
| **DB Driver** | `pg` (node-postgres) with connection pooling |
| **Auth** | JWT (`jsonwebtoken`) + bcrypt password hashing |
| **Real-time** | Socket.IO 4.8 |
| **Email** | Brevo (Sendinblue) Transactional API |
| **Cron Jobs** | `node-cron` |
| **Excel Export** | `xlsx` (SheetJS) |
| **Password Reset** | Crypto tokens (SHA-256 hashed, 1hr expiry) |
| **Dev Server** | `nodemon` |

---

## System Architecture

```mermaid
flowchart TB
    subgraph Client["Client Layer"]
        FE["React Frontend\n(Vite / Vercel)"]
        WS["WebSocket Client\n(Socket.IO)"]
    end

    subgraph Gateway["API Gateway Layer"]
        EXP["Express App\n(app.js)"]
        CORS["CORS Middleware\n(FRONTEND_URL whitelist)"]
        AUTH_MW["authenticate()\nmiddleware\n(JWT verify + suspend check)"]
        AUTHZ_MW["authorize(roles)\nmiddleware\n(RBAC)"]
    end

    subgraph Routes["Route Layer"]
        R_AUTH["/api/auth"]
        R_GOALS["/api/goals"]
        R_MANAGER["/api/manager"]
        R_CHECKINS["/api/checkins"]
        R_ADMIN["/api/admin"]
        R_ANALYTICS["/api/analytics"]
        R_REPORTS["/api/reports"]
        R_NOTIF["/api/notifications"]
    end

    subgraph Controllers["Controller Layer"]
        C_AUTH["authController\nlogin / getMe\nforgot-password / reset-password"]
        C_GOAL["goalController\nCRUD goals\nsubmit / request modification"]
        C_MGR["managerController\napprove / return sheets\nteam check-in comments"]
        C_CHECKIN["checkinController\nupsert check-ins\ncompute progress scores"]
        C_ADMIN["adminController\nuser CRUD / cycles\nescalation rules / audit logs"]
        C_ANALYTICS["analyticsController\nQoQ trends / heatmap\ndept distribution / manager effectiveness"]
        C_REPORT["reportController\nXLSX achievement report\ncompletion report"]
    end

    subgraph Services["Service / Config Layer"]
        DB["PostgreSQL Pool\n(Neon, SSL, max:10)"]
        MAIL["Email Service\n(Brevo REST API)"]
        SOCKET["Socket.IO Server\nroom-user-{id}\nroom-manager-{id}\nroom-admin"]
        AUDIT["Audit Logger\naudit_logs table"]
        CRON["Escalation Cron Job\n0 9 * * *\n(daily 9AM)"]
    end

    subgraph DB_Tables["PostgreSQL Tables"]
        T_USERS["users"]
        T_GS["goal_sheets"]
        T_GOALS["goals"]
        T_CYCLES["goal_cycles"]
        T_TA["thrust_areas"]
        T_CHECKINS["checkins"]
        T_NOTIF["notifications"]
        T_AUDIT["audit_logs"]
        T_ESC_RULES["escalation_rules"]
        T_ESC_LOGS["escalation_logs"]
        T_PWD["password_resets"]
    end

    FE -->|HTTP REST| EXP
    WS -->|WebSocket| SOCKET
    EXP --> CORS --> AUTH_MW --> AUTHZ_MW
    AUTHZ_MW --> Routes
    R_AUTH --> C_AUTH
    R_GOALS --> C_GOAL
    R_MANAGER --> C_MGR
    R_CHECKINS --> C_CHECKIN
    R_ADMIN --> C_ADMIN
    R_ANALYTICS --> C_ANALYTICS
    R_REPORTS --> C_REPORT
    R_NOTIF --> C_AUTH

    C_AUTH & C_GOAL & C_MGR & C_CHECKIN & C_ADMIN & C_ANALYTICS & C_REPORT --> DB
    C_AUTH & C_GOAL & C_MGR & C_CHECKIN & C_ADMIN --> MAIL
    C_GOAL & C_MGR & C_CHECKIN & C_ADMIN --> SOCKET
    C_AUTH & C_GOAL & C_MGR & C_ADMIN --> AUDIT
    CRON --> DB
    CRON --> MAIL

    DB --> T_USERS & T_GS & T_GOALS & T_CYCLES & T_TA & T_CHECKINS & T_NOTIF & T_AUDIT & T_ESC_RULES & T_ESC_LOGS & T_PWD
```

---

## Database Schema

```mermaid
erDiagram
    users {
        int id PK
        string name
        string email
        string password_hash
        string role
        string department
        int manager_id FK
        bool is_suspended
        timestamp created_at
    }

    goal_cycles {
        int id PK
        string cycle_name
        string phase
        timestamp window_open
        timestamp window_close
        bool is_active
        int created_by FK
    }

    thrust_areas {
        int id PK
        string name
        string description
    }

    goal_sheets {
        int id PK
        int employee_id FK
        int cycle_id FK
        string status
        bool is_locked
        string return_reason
        timestamp submitted_at
        timestamp approved_at
    }

    goals {
        int id PK
        int goal_sheet_id FK
        int thrust_area_id FK
        string title
        string description
        string uom_type
        float target_value
        date target_date
        float weightage
    }

    checkins {
        int id PK
        int goal_id FK
        int employee_id FK
        int manager_id FK
        string cycle_phase
        float actual_value
        date actual_date
        string status
        float progress_score
        string employee_note
        string manager_comment
        timestamp checked_in_at
    }

    notifications {
        int id PK
        int user_id FK
        string type
        string message
        int related_id
        bool is_read
        timestamp created_at
    }

    audit_logs {
        int id PK
        string table_name
        int record_id
        string action
        int changed_by FK
        json old_values
        json new_values
        timestamp changed_at
    }

    escalation_rules {
        int id PK
        string trigger_event
        int days_threshold
        bool notify_employee
        bool notify_manager
        bool is_active
        timestamp created_at
    }

    escalation_logs {
        int id PK
        int rule_id FK
        int triggered_for FK
        string event_type
        string message
        string notified_to
        timestamp triggered_at
    }

    password_resets {
        int id PK
        int user_id FK
        string token_hash
        timestamp expires_at
        timestamp used_at
    }

    users ||--o{ goal_sheets : "employee submits"
    users ||--o{ checkins : "employee checks in"
    users ||--o{ checkins : "manager reviews"
    goal_cycles ||--o{ goal_sheets : "cycle has sheets"
    goal_sheets ||--o{ goals : "sheet has goals"
    thrust_areas ||--o{ goals : "goal maps to area"
    goals ||--o{ checkins : "goal has checkins"
    users ||--o{ notifications : "user receives"
    users ||--o{ audit_logs : "user triggers"
    escalation_rules ||--o{ escalation_logs : "rule triggers log"
    users ||--o{ password_resets : "user resets"
```

---

## Folder Structure

```
AtomQuest-Backend/
│
├── index.js                        # Entry point — starts HTTP server, boots cron job
│
├── package.json                    # Dependencies & npm scripts
├── .env.example                    # Sample environment variables
├── .gitignore
│
└── src/
    ├── app.js                      # Express app setup — CORS, routes, global error handlers
    │
    ├── config/
    │   ├── db.js                   # PostgreSQL connection pool (Neon, SSL, max 10 conns)
    │   ├── email.js                # Brevo REST email client + all 9 HTML email templates
    │   └── socket.js               # Socket.IO server init, room management, emit helpers
    │
    ├── middleware/
    │   ├── auth.js                 # JWT authenticate() + RBAC authorize(...roles) middleware
    │   └── auditLogger.js          # logAudit() helper — writes JSON diffs to audit_logs table
    │
    ├── jobs/
    │   └── escalationJob.js        # node-cron daily job (9 AM) — 3 escalation trigger types
    │
    ├── routes/
    │   ├── auth.js                 # POST /login, GET /me, forgot-password, reset-password
    │   ├── goals.js                # Employee goal sheet CRUD + submit + request-modification
    │   ├── manager.js              # Manager team view, approve/return, check-in comments
    │   ├── checkins.js             # Upsert check-ins, get check-ins per goal
    │   ├── admin.js                # User CRUD, cycles, escalation rules, audit logs, unlock
    │   ├── analytics.js            # QoQ trends, heatmap, distribution, manager effectiveness
    │   ├── reports.js              # XLSX achievement report, JSON completion report
    │   └── notifications.js        # List notifications, mark as read, mark all read
    │
    └── controllers/
        ├── authController.js       # Login, JWT issuance, getMe, password reset flow
        ├── goalController.js       # Goal sheet & individual goal CRUD, weightage validation
        ├── managerController.js    # Team sheet overview, approve/return, goals detail view
        ├── checkinController.js    # Check-in upsert with score computation, manager comment
        ├── adminController.js      # Full admin suite — users, cycles, escalation, unlock
        ├── analyticsController.js  # Aggregation queries for 5 analytics endpoints
        └── reportController.js     # XLSX (SheetJS) and JSON report generation
```

---

## API Reference

All protected routes require:
```
Authorization: Bearer <JWT_TOKEN>
```

---

### Auth Routes `/api/auth`

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| `POST` | `/login` | ❌ | Any | Login with email + password, returns JWT + user object |
| `GET` | `/me` | ✅ | Any | Get currently authenticated user's full profile |
| `POST` | `/forgot-password` | ❌ | Any | Send password reset email with SHA-256 token (1hr expiry) |
| `POST` | `/reset-password` | ❌ | Any | Verify token, update password, mark token as used |
| `POST` | `/seed-passwords` | ❌ | Any | **Dev only** — seeds all users with `password123` |

**Login Request:**
```json
{ "email": "user@company.com", "password": "yourpassword" }
```

**Login Response:**
```json
{
  "token": "eyJhbGci...",
  "user": {
    "id": 1,
    "name": "John",
    "email": "john@company.com",
    "role": "EMPLOYEE",
    "department": "Engineering"
  }
}
```

**JWT Token Payload:**
```json
{
  "id": 1,
  "name": "John",
  "email": "john@company.com",
  "role": "EMPLOYEE",
  "managerId": 3,
  "department": "Engineering"
}
```

---

### Goal Routes `/api/goals`

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| `GET` | `/thrust-areas` | ✅ | Any | List all thrust areas (goal categories) |
| `GET` | `/cycles` | ✅ | Any | List all goal cycles with window open/close dates |
| `GET` | `/my-sheet` | ✅ | EMPLOYEE | Get own goal sheet + goals + latest progress score per goal |
| `POST` | `/sheet` | ✅ | EMPLOYEE | Create a new goal sheet for the current cycle |
| `POST` | `/` | ✅ | EMPLOYEE | Add a goal to a goal sheet |
| `PUT` | `/:id` | ✅ | EMPLOYEE | Update a goal (only allowed when sheet is DRAFT/RETURNED) |
| `DELETE` | `/:id` | ✅ | EMPLOYEE | Delete a goal from a sheet |
| `POST` | `/submit/:sheetId` | ✅ | EMPLOYEE | Submit goal sheet for manager review |
| `POST` | `/request-modification/:sheetId` | ✅ | EMPLOYEE | Request modification from manager with a reason |

**Business Rules enforced:**
- Goal window must be open (checked against `goal_cycles.window_open` and `window_close`)
- Minimum **10% weightage** per goal
- Cannot edit goals once sheet status is `APPROVED` or `SUBMITTED` (unless returned/unlocked)
- One goal sheet per employee per cycle

**Add Goal Request:**
```json
{
  "goalSheetId": 5,
  "thrustAreaId": 2,
  "title": "Reduce system downtime",
  "description": "Achieve 99.9% uptime SLA",
  "uomType": "MAX",
  "targetValue": 99.9,
  "targetDate": "2025-12-31",
  "weightage": 25
}
```

`uomType` values: `MAX` (maximize), `MIN` (minimize), `TIMELINE` (on-time delivery), `ZERO` (zero occurrence)

---

### Manager Routes `/api/manager`

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| `GET` | `/team-sheets` | ✅ | MANAGER, ADMIN | Get team's goal sheets with aggregated stats |
| `GET` | `/sheet/:sheetId` | ✅ | MANAGER, ADMIN | Get full detail of one employee's goal sheet + goals + check-ins |
| `POST` | `/approve/:sheetId` | ✅ | MANAGER, ADMIN | Approve a submitted goal sheet (locks it) |
| `POST` | `/return/:sheetId` | ✅ | MANAGER, ADMIN | Return a goal sheet for rework with a mandatory reason |

**Team Sheets Response (per employee):**

| Field | Description |
|---|---|
| `goal_count` | Total goals in this employee's sheet |
| `total_weightage` | Sum of all goal weightages |
| `average_progress` | Mean progress score across all check-ins |
| `completed_goals` | Goals with status = COMPLETED |
| `on_track_goals` | Goals with status = ON_TRACK |
| `not_started_goals` | Goals with no check-in yet |
| `pending_checkins` | Goals that have never been checked in |

**On Approve/Return:**
- Email sent to employee
- Socket.IO real-time event pushed to employee's room
- `notifications` table row inserted
- `audit_logs` entry created

---

### Check-in Routes `/api/checkins`

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| `POST` | `/` | ✅ | EMPLOYEE | Create or update (upsert) a check-in for a goal |
| `GET` | `/goal/:goalId` | ✅ | Any | Get all check-ins for a specific goal ordered by date |
| `POST` | `/manager-comment` | ✅ | MANAGER, ADMIN | Add or update manager comment on an existing check-in |

**Check-in Request (Upsert):**
```json
{
  "goalId": 10,
  "cyclePhase": "Q2",
  "actualValue": 87.5,
  "actualDate": "2025-06-30",
  "status": "ON_TRACK",
  "employeeNote": "On track, slight dip due to infra migration"
}
```

`status` values: `NOT_STARTED` | `ON_TRACK` | `COMPLETED` | `DELAYED`

`cyclePhase` values: `Q1` | `Q2` | `Q3` | `Q4` | `H1` | `H2` | `Annual`

**Progress score is auto-computed** based on the goal's `uomType` — see [Scoring Algorithm](#scoring-algorithm).

**On check-in save:**
- Notifies manager via Socket.IO event `new_checkin`
- Sends `checkinSaved` email to manager

---

### Admin Routes `/api/admin`

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| `GET` | `/users` | ✅ | ADMIN | List all users with manager relationships and suspension status |
| `POST` | `/users` | ✅ | ADMIN | Create a new user (hashes password, sends welcome email with credentials) |
| `PUT` | `/users/:id` | ✅ | ADMIN | Update user profile, role, or manager assignment |
| `DELETE` | `/users/:id` | ✅ | ADMIN | Delete a user account |
| `PUT` | `/users/:id/suspend` | ✅ | ADMIN | Suspend or unsuspend a user (invalidates active sessions) |
| `GET` | `/goal-sheets` | ✅ | ADMIN | View all goal sheets across all employees and cycles |
| `POST` | `/unlock/:sheetId` | ✅ | ADMIN | Unlock an approved/locked sheet, set status back to RETURNED |
| `GET` | `/audit-logs` | ✅ | ADMIN | View full audit log (filterable by `startDate` and `endDate`) |
| `POST` | `/cycles` | ✅ | ADMIN | Create a new goal cycle (deactivates others if `isActive: true`) |
| `PUT` | `/cycles/:id` | ✅ | ADMIN | Update an existing cycle's window/phase/status |
| `GET` | `/escalation-rules` | ✅ | ADMIN | List all configured escalation rules |
| `POST` | `/escalation-rules` | ✅ | ADMIN | Create a new escalation rule |
| `PUT` | `/escalation-rules/:id` | ✅ | ADMIN | Update an escalation rule (threshold, notify flags, active toggle) |

**User Suspension Behavior:** Suspended users get `401 Unauthorized` on every authenticated request. The `authenticate` middleware queries the DB live (not just the JWT) to check `is_suspended`, so suspension takes immediate effect without waiting for JWT expiry.

---

### Analytics Routes `/api/analytics`

All analytics endpoints require **MANAGER or ADMIN** role.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/qoq-trends` | QoQ average progress scores per cycle phase (with Engineering dept breakdown) |
| `GET` | `/completion-heatmap` | Check-in completion rates grouped by cycle phase |
| `GET` | `/goal-distribution` | Goal count matrix: department × thrust area |
| `GET` | `/manager-effectiveness` | Per-manager stats: sheets approved, check-ins reviewed |
| `GET` | `/live-insights` | Live KPIs: lowest performer, most delayed goal, avg approval time, checkin rate, dept metrics |

**QoQ Trends Sample Response:**
```json
[
  {
    "cycle_phase": "Q1",
    "avg_progress_score": "72.50",
    "engineering_avg_progress": "68.20",
    "total_checkins": 45
  },
  {
    "cycle_phase": "Q2",
    "avg_progress_score": "78.30",
    "engineering_avg_progress": "81.00",
    "total_checkins": 52
  }
]
```

**Live Insights Sample Response:**
```json
{
  "lowest_performer": { "name": "John Doe", "avg_progress": 34.2 },
  "delayed_objective": { "title": "Reduce TAT by 20%", "days_delayed": 14 },
  "avg_approval_time": 1.4,
  "checkin_rate": 94.2,
  "department_metrics": [
    { "department": "Engineering", "avg_progress": 78.5 },
    { "department": "Sales", "avg_progress": 65.3 }
  ]
}
```

---

### Reports Routes `/api/reports`

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| `GET` | `/achievement` | ✅ | ADMIN | Downloads full achievement data as `.xlsx` file (binary response) |
| `GET` | `/completion` | ✅ | ADMIN | Returns JSON completion summary per employee |

**Achievement XLSX Columns:**
`Employee Name`, `Email`, `Department`, `Manager`, `Cycle`, `Goal Title`, `Description`, `UoM Type`, `Target Value`, `Target Date`, `Weightage`, `Check-in Phase`, `Actual Value`, `Actual Date`, `Status`, `Progress Score`, `Manager Comment`

---

### Notification Routes `/api/notifications`

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| `GET` | `/` | ✅ | Any | Get all unread notifications for the logged-in user |
| `PUT` | `/:id/read` | ✅ | Any | Mark a single notification as read |
| `PUT` | `/read-all` | ✅ | Any | Mark all notifications as read for the user |

**Notification `type` values:** `GOAL_SUBMITTED` | `GOAL_APPROVED` | `GOAL_RETURNED` | `CHECKIN_SUBMITTED` | `ESCALATION`

---

## Role-Based Access Control

```mermaid
flowchart LR
    EMPLOYEE["👤 EMPLOYEE"]
    MANAGER["👔 MANAGER"]
    ADMIN["🔑 ADMIN"]

    EMPLOYEE -->|"Create/edit goal sheets\nSubmit goals\nUpdate check-ins\nRequest modification"| GOAL_OPS["Goal Operations"]
    MANAGER -->|"View team sheets\nApprove / Return goals\nAdd check-in comments\nView analytics"| MANAGER_OPS["Manager Operations"]
    ADMIN -->|"Full user CRUD\nCycle management\nUnlock sheets\nEscalation rules\nAudit logs\nAll reports"| ADMIN_OPS["Admin Operations"]
    ADMIN -.->|"inherits all"| MANAGER_OPS
```

The `authenticate` middleware:
1. Extracts Bearer token from `Authorization` header
2. Verifies JWT signature against `JWT_SECRET`
3. **Queries the DB live** to check if user is deleted or suspended
4. Attaches `req.user` with full decoded payload

The `authorize(...roles)` middleware checks `req.user.role` against the whitelist.

---

## Real-Time Events (Socket.IO)

```mermaid
sequenceDiagram
    participant Client
    participant Server as Socket.IO Server

    Client->>Server: emit('join_user_room', userId)
    Server-->>Client: Joined room-user-{userId}

    Client->>Server: emit('join_manager_room', managerId)
    Server-->>Client: Joined room-manager-{managerId}

    Client->>Server: emit('join_admin_room')
    Server-->>Client: Joined room-admin

    Note over Server: Employee submits goal sheet
    Server->>Client: room-manager-{id} ← 'goal_submitted'

    Note over Server: Manager approves goal sheet
    Server->>Client: room-user-{id} ← 'goal_approved'

    Note over Server: Manager returns goal sheet
    Server->>Client: room-user-{id} ← 'goal_returned'

    Note over Server: Employee saves check-in
    Server->>Client: room-manager-{id} ← 'new_checkin'
```

**Socket emit helpers (`src/config/socket.js`):**

| Helper | Target | Use case |
|---|---|---|
| `emitToUser(userId, event, data)` | `room-user-{id}` | Notify a specific employee |
| `emitToManager(managerId, event, data)` | `room-manager-{id}` | Notify a specific manager |
| `emitToAdmin(event, data)` | `room-admin` | Broadcast to all connected admins |
| `emitToAll(event, data)` | All sockets | Global system broadcast |

---

## Email System (Brevo)

All emails are sent via Brevo's REST API (not SMTP). The `sendEmail()` function in `src/config/email.js`:
- Accepts `to`, `toName`, `subject`, `html`, `text`, `replyTo`, `tags`
- Auto-generates a plaintext version by stripping HTML tags if `text` is not provided
- **Soft-fails** — email errors are caught and logged, but never propagate to crash the request

### Email Templates

| Template Key | Trigger Event | Recipients |
|---|---|---|
| `goalSubmitted` | Employee submits goal sheet | Manager |
| `goalApproved` | Manager approves goal sheet | Employee |
| `goalReturned` | Manager returns goal sheet for rework | Employee (includes reason) |
| `checkinReminder` | Admin/cron triggers manual reminder | Employee |
| `checkinSaved` | Employee submits a check-in | Manager |
| `escalationAlert` | Daily cron escalation rule fires | Employee and/or Manager |
| `goalUnlockedByAdmin` | Admin unlocks a previously locked sheet | Employee |
| `userAdded` | Admin creates a new user account | New user (includes temp credentials) |
| `passwordReset` | User requests a password reset | User (includes secure reset link) |

---

## Escalation Cron Job

**Schedule:** Every day at 9:00 AM (`0 9 * * *`)  
**File:** `src/jobs/escalationJob.js`  
**Boot:** Called once in `index.js` via `startEscalationJob()`

```mermaid
flowchart TD
    START["⏰ Daily Cron Trigger\n9:00 AM"]
    FETCH_RULES["Fetch all active escalation_rules"]

    START --> FETCH_RULES

    FETCH_RULES --> RULE1["Trigger: GOAL_NOT_SUBMITTED\nEmployees with NO goal sheet at all"]
    FETCH_RULES --> RULE2["Trigger: GOAL_NOT_APPROVED\nSheets in SUBMITTED status older\nthan days_threshold"]
    FETCH_RULES --> RULE3["Trigger: CHECKIN_MISSING\nApproved sheets with goals\nthat have zero check-ins"]

    RULE1 --> NOTIFY1["Email notify_employee + notify_manager\nInsert escalation_logs row"]
    RULE2 --> NOTIFY2["Email notify_manager + notify_employee\nInsert escalation_logs row"]
    RULE3 --> NOTIFY3["Email notify_employee + notify_manager\nInsert escalation_logs row"]
```

**Escalation Rule fields:**

| Field | Type | Description |
|---|---|---|
| `trigger_event` | string | `GOAL_NOT_SUBMITTED` \| `GOAL_NOT_APPROVED` \| `CHECKIN_MISSING` |
| `days_threshold` | integer | Days after which escalation triggers |
| `notify_employee` | boolean | Whether to email the employee |
| `notify_manager` | boolean | Whether to email the manager |
| `is_active` | boolean | Inactive rules are skipped entirely |

---

## Scoring Algorithm

**File:** `src/controllers/checkinController.js` → `computeScore()`

Progress scores are auto-calculated based on the goal's `uomType`:

| UoM Type | Formula | Cap | Example |
|---|---|---|---|
| `MAX` (Maximize — higher is better) | `(actual / target) × 100` | 150% | Target: 100, Actual: 85 → **85%** |
| `MIN` (Minimize — lower is better) | `(target / actual) × 100` | 150% | Target: 10 defects, Actual: 8 → **125%** |
| `TIMELINE` (Date-based delivery) | `100` if `actualDate ≤ targetDate` else `0` | 100% | Delivered on time → **100%** |
| `ZERO` (Zero occurrence = success) | `100` if `actual === 0` else `0` | 100% | Zero incidents → **100%** |

- Scores are **capped at 150%** to reward over-achievement
- Stored as `progress_score` (float) in the `checkins` table
- Overall goal sheet progress = weighted average across all goals using `AVG(progress_score)` from PostgreSQL

---

## Audit Logging

Every significant write operation calls `logAudit()` from `src/middleware/auditLogger.js`:

```js
await logAudit({
  tableName: 'goal_sheets',
  recordId: sheetId,
  action: 'APPROVE',
  changedBy: req.user.id,
  oldValues: { status: 'SUBMITTED' },
  newValues: { status: 'APPROVED', approved_at: new Date() }
});
```

**Tracked actions:** `LOGIN` | `CREATE` | `UPDATE` | `DELETE` | `APPROVE` | `RETURN` | `UNLOCK` | `SUSPEND`

The `audit_logs` table stores full JSON diffs with old and new values, actor ID, target table, and timestamp. Admins can query and filter audit logs via `GET /api/admin/audit-logs?startDate=2025-01-01&endDate=2025-06-30`.

---

## Environment Variables

```env
# Server
PORT=5000

# Database (Neon PostgreSQL)
DATABASE_URL=postgresql://user:pass@host.neon.tech/dbname?sslmode=require

# JWT
JWT_SECRET=your_super_secret_key_here
JWT_EXPIRES_IN=7d

# Brevo Email API
BREVO_API_KEY=xkeysib-your-api-key
BREVO_SENDER_EMAIL=noreply@yourapp.com
BREVO_SENDER_NAME=AtomQuest Portal
BREVO_REPLY_TO=support@yourapp.com

# Frontend (used in CORS and email links)
FRONTEND_URL=https://your-frontend.vercel.app
```

---

## Local Development

**Prerequisites:** Node.js 18+, a Neon or local PostgreSQL database

```bash
# 1. Clone the repository
git clone https://github.com/Samarth-254/AtomQuest-Backend.git
cd AtomQuest-Backend

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Fill in DATABASE_URL, JWT_SECRET, BREVO keys, and FRONTEND_URL

# 4. Start dev server with hot reload
npm run dev
# → PostgreSQL connected (Neon)
# → Server running on port 5000
# → Escalation cron scheduled for every day at 9:00 AM

# 5. Seed demo passwords (optional)
curl -X POST http://localhost:5000/api/auth/seed-passwords
# All users → password: password123

# 6. Health check
curl http://localhost:5000/api/health
# → { "status": "ok", "message": "Server healthy", "timestamp": "..." }
```

---

## Deployment

The backend is production-ready for **Render**, **Railway**, or any Node.js PaaS.

**Render (recommended):**
1. Connect GitHub repo → New Web Service
2. Build Command: `npm install`
3. Start Command: `npm start`
4. Add all environment variables in Render dashboard
5. Enable auto-deploy from `main` branch

**Docker:**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
```

**CORS:** Set `FRONTEND_URL` to your exact Vercel/Netlify frontend URL. The Express app whitelists this origin and enables credentials.

**SSL:** The PostgreSQL pool uses `ssl: { rejectUnauthorized: false }` for Neon serverless compatibility.

---

## Goal Lifecycle

```mermaid
stateDiagram-v2
    [*] --> DRAFT : Employee creates goal sheet\n(POST /api/goals/sheet)
    DRAFT --> SUBMITTED : Employee submits\n(POST /api/goals/submit/:sheetId)
    SUBMITTED --> APPROVED : Manager approves\n(POST /api/manager/approve/:sheetId)
    SUBMITTED --> RETURNED : Manager returns with reason\n(POST /api/manager/return/:sheetId)
    RETURNED --> DRAFT : Employee edits and re-submits
    APPROVED --> LOCKED : Goals locked automatically
    LOCKED --> RETURNED : Admin unlocks\n(POST /api/admin/unlock/:sheetId)
    APPROVED --> CHECKINS : Employee logs quarterly check-ins\n(POST /api/checkins)
    CHECKINS --> CHECKINS : Manager adds comments\n(POST /api/checkins/manager-comment)
```

---

<div align="center">

Built with ❤️ for the AtomQuest Hackathon — ZS Associates Campus Beats

</div>
