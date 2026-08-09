# 🚀 ColdMail AI — Production-Ready Cold Emailing Platform

ColdMail AI is an anti-spam cold emailing platform designed for safe outreach, dynamic contact list management, PDF attachments, live spam score inspection, domain DNS deliverability diagnostics (SPF/DKIM/DMARC), email scheduling, and open tracking.

---

## 🛠️ Complete `.env` Environment Variables Guide

To send cold emails without getting flagged as spam, configure your environment variables in `.env` in the root folder of the project.

### Sample `.env` File
```env
# ==========================================
# 1. SMTP Credentials (Required for sending)
# ==========================================
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=abcd efgh ijkl mnop
FROM_NAME=Your Name or Company
FROM_EMAIL=your_email@gmail.com

# ==========================================
# 2. Application Base URL (For Tracking & Unsubscribe)
# ==========================================
APP_URL=http://localhost:8000

# ==========================================
# 3. Database URL (Optional for Cloud DB)
# ==========================================
# Leave empty to use local SQLite (coldmail.db)
# Or provide PostgreSQL URL for Render / Supabase / Neon:
# DATABASE_URL=postgresql://username:password@hostname:5432/dbname?sslmode=require

# ==========================================
# 4. Clerk Google OAuth Authentication (Optional)
# ==========================================
# Obtain from https://clerk.com -> API Keys
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

---

## 📋 Variable Explanations

| Variable | Required? | Description | Default / Example |
| :--- | :---: | :--- | :--- |
| `SMTP_HOST` | **YES** | Hostname of your email provider's SMTP server. | `smtp.gmail.com` |
| `SMTP_PORT` | **YES** | Port for sending emails. `587` for STARTTLS, `465` for SSL. | `587` |
| `SMTP_USER` | **YES** | Sender email address / SMTP username. | `alex@gmail.com` |
| `SMTP_PASS` | **YES** | **App Password** generated from your email account (16 chars). | `abcd efgh ijkl mnop` |
| `FROM_NAME` | **YES** | Name shown in recipient's inbox. | `Alex - Founder` |
| `FROM_EMAIL`| **YES** | Sender email address (usually same as `SMTP_USER`). | `alex@gmail.com` |
| `APP_URL` | **YES** | Base URL for one-click unsubscribe links & tracking pixel. | `http://localhost:8000` |
| `DATABASE_URL`| Optional | PostgreSQL URI for cloud production. Defaults to SQLite. | `postgresql://...` |

---

## 🔑 How to Generate a Gmail App Password

If you are using Gmail or Google Workspace, **do NOT use your regular account password**. Google requires an **App Password**:

1. Go to your [Google Account Security Settings](https://myaccount.google.com/security).
2. Ensure **2-Step Verification** is turned **ON**.
3. In the top search bar of Google Account, search for **App Passwords** (or visit `https://myaccount.google.com/apppasswords`).
4. Enter an App Name (e.g., `ColdMail Platform`) and click **Create**.
5. Google will display a **16-character passcode** (e.g., `abcd efgh ijkl mnop`).
6. Copy this 16-character code into your `.env` file as `SMTP_PASS`.

---

## 🏃 How to Run the Application Locally

### Step 1: Install Dependencies
Open your terminal in the project directory:

```bash
# Install Python backend dependencies
python -m pip install -r server/requirements.txt

# Install React frontend dependencies
cd client
npm install
cd ..
```

### Step 2: Start the Backend Server (Python FastAPI)
Run the backend server on port 8000:
```bash
python -m uvicorn server.main:app --port 8000 --reload
```
- API Health Check: [http://localhost:8000/api/health](http://localhost:8000/api/health)

### Step 3: Start the Frontend Application (Vite + React)
In a second terminal window, run:
```bash
cd client
npm run dev
```
- Open Dashboard in browser: [http://localhost:5173](http://localhost:5173)

---

## 🧪 How to Verify Everything Works

1. **Test SMTP Connection**:
   - Navigate to **SMTP Settings** in the dashboard.
   - Enter your email address in the **Test Connection** box and click **Send Test Email**.
   - Verify that you receive the test email in your inbox!

2. **Import CSV Contacts**:
   - Navigate to **Contacts & CSV**.
   - Drag and drop `sample_contacts.csv` or your own contact CSV list.
   - The app will automatically validate recipient domain MX records.

3. **Check Live Spam Meter**:
   - Navigate to **Create Campaign**.
   - Type your subject line and email body.
   - The right sidebar will display a live **Spam Score (0–10)**, flagged trigger words, and actionable deliverability advice.

4. **Attach PDF & Launch Campaign**:
   - Upload any PDF document to attach to outreach emails.
   - Click **Launch Campaign & Start Sending**.
   - Monitor live dispatches and recipient open logs in **Campaigns**.

---

## 🌐 Deploying to Production (Render & Vercel)

### Deploy Backend to Render:
1. Connect your GitHub repository to [Render.com](https://render.com).
2. Render will automatically detect `render.yaml`.
3. Add `SMTP_USER`, `SMTP_PASS`, `FROM_NAME`, `FROM_EMAIL`, and `DATABASE_URL` (PostgreSQL) in Render environment settings.

### Deploy Frontend to Vercel:
1. Import the `client/` directory into [Vercel.com](https://vercel.com).
2. Set Environment Variable: `VITE_API_URL=https://your-backend.onrender.com`.
3. Vercel will build the frontend using `client/vercel.json`.
