import os
import csv
import io
import smtplib
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Response, BackgroundTasks, Depends
from pydantic import BaseModel

from server.database import get_db, get_setting, set_setting, log_event, recalculate_queue_schedule_times
from server.services.anti_spam import analyze_email_content, personalize_template, check_google_account_safety
from server.services.domain_checker import check_domain_mx, audit_sender_domain
from server.services.email_worker import worker, send_single_email
from server.auth import create_access_token, get_admin_credentials, verify_authenticated_user

router = APIRouter(prefix="/api")

# --- Pydantic Models ---
class ContactCreate(BaseModel):
    first_name: Optional[str] = ""
    last_name: Optional[str] = ""
    email: str
    company_name: Optional[str] = ""
    title: Optional[str] = ""
    phone: Optional[str] = ""
    stage: Optional[str] = ""
    linkedin_url: Optional[str] = ""

class CampaignCreate(BaseModel):
    name: str
    subject: str
    body_html: str
    contact_ids: List[int]
    scheduled_at: Optional[str] = None
    min_delay_sec: int = 30
    max_delay_sec: int = 90
    batch_size: int = 50
    daily_limit: int = 200
    track_opens: bool = True
    attachment_filename: Optional[str] = None
    attachment_path: Optional[str] = None

class SpamCheckRequest(BaseModel):
    subject: str
    body_html: str

class SmtpSettingsModel(BaseModel):
    smtp_host: str
    smtp_port: int
    smtp_user: str
    smtp_pass: str
    from_name: str
    from_email: str
    app_url: Optional[str] = "http://localhost:8000"

class TestSmtpRequest(BaseModel):
    test_email: str

class LoginRequest(BaseModel):
    username: str
    password: str

class ChangePasswordRequest(BaseModel):
    new_username: str
    new_password: str

# --- 0. Authentication Routes ---
@router.post("/auth/login")
def login(req: LoginRequest):
    creds = get_admin_credentials()
    if req.username == creds["username"] and req.password == creds["password"]:
        token = create_access_token(req.username)
        return {"status": "success", "access_token": token, "token_type": "bearer", "username": req.username}
    else:
        raise HTTPException(status_code=401, detail="Invalid username or password. Please try again.")

@router.get("/auth/me")
def get_current_user(user: dict = Depends(verify_authenticated_user)):
    return {"status": "authenticated", "username": user.get("sub", "admin")}

@router.post("/auth/change-password")
def change_password(req: ChangePasswordRequest, user: dict = Depends(verify_authenticated_user)):
    if not req.new_username.strip() or not req.new_password.strip():
        raise HTTPException(status_code=400, detail="Username and password cannot be empty.")
    set_setting("ADMIN_USERNAME", req.new_username.strip())
    set_setting("ADMIN_PASSWORD", req.new_password.strip())
    return {"status": "success", "message": "Admin credentials updated successfully!"}

# --- 1. Health & Dashboard Analytics ---
@router.get("/health")
def health_check():
    return {"status": "ok", "service": "ColdMail Anti-Spam Engine"}

@router.get("/analytics")
def get_analytics(user: dict = Depends(verify_authenticated_user)):
    u_id = user.get("user_id", "default")
    conn = get_db()
    cursor = conn.cursor()

    if IS_POSTGRES:
        cursor.execute("SELECT COUNT(*) as total FROM contacts WHERE user_id = %s", (u_id,))
        total_contacts = cursor.fetchone()["total"]
        cursor.execute("SELECT COUNT(*) as total FROM unsubscribes WHERE user_id = %s", (u_id,))
        total_unsubscribes = cursor.fetchone()["total"]
        cursor.execute("SELECT COUNT(*) as total FROM campaigns WHERE user_id = %s", (u_id,))
        total_campaigns = cursor.fetchone()["total"]
        cursor.execute("SELECT COUNT(*) as total FROM campaign_contacts WHERE user_id = %s AND status = 'sent'", (u_id,))
        total_sent = cursor.fetchone()["total"]
        cursor.execute("SELECT COUNT(*) as total FROM campaign_contacts WHERE user_id = %s AND status = 'pending'", (u_id,))
        total_pending = cursor.fetchone()["total"]
        cursor.execute("SELECT COUNT(*) as total FROM campaign_contacts WHERE user_id = %s AND status = 'failed'", (u_id,))
        total_failed = cursor.fetchone()["total"]
        cursor.execute("SELECT COUNT(*) as total FROM campaign_contacts WHERE user_id = %s AND open_count > 0", (u_id,))
        total_opened = cursor.fetchone()["total"]
    else:
        cursor.execute("SELECT COUNT(*) as total FROM contacts WHERE user_id = ?", (u_id,))
        total_contacts = cursor.fetchone()["total"]
        cursor.execute("SELECT COUNT(*) as total FROM unsubscribes WHERE user_id = ?", (u_id,))
        total_unsubscribes = cursor.fetchone()["total"]
        cursor.execute("SELECT COUNT(*) as total FROM campaigns WHERE user_id = ?", (u_id,))
        total_campaigns = cursor.fetchone()["total"]
        cursor.execute("SELECT COUNT(*) as total FROM campaign_contacts WHERE user_id = ? AND status = 'sent'", (u_id,))
        total_sent = cursor.fetchone()["total"]
        cursor.execute("SELECT COUNT(*) as total FROM campaign_contacts WHERE user_id = ? AND status = 'pending'", (u_id,))
        total_pending = cursor.fetchone()["total"]
        cursor.execute("SELECT COUNT(*) as total FROM campaign_contacts WHERE user_id = ? AND status = 'failed'", (u_id,))
        total_failed = cursor.fetchone()["total"]
        cursor.execute("SELECT COUNT(*) as total FROM campaign_contacts WHERE user_id = ? AND open_count > 0", (u_id,))
        total_opened = cursor.fetchone()["total"]

    conn.close()

    open_rate = round((total_opened / total_sent * 100), 1) if total_sent > 0 else 0.0

    return {
        "total_contacts": total_contacts,
        "total_campaigns": total_campaigns,
        "total_sent": total_sent,
        "total_pending": total_pending,
        "total_failed": total_failed,
        "total_opened": total_opened,
        "total_unsubscribes": total_unsubscribes,
        "open_rate": open_rate
    }

@router.get("/account-safety")
def get_account_safety(user: dict = Depends(verify_authenticated_user)):
    u_id = user.get("user_id", "default")
    from_email = get_setting("FROM_EMAIL", "", user_id=u_id)
    return check_google_account_safety(from_email)

# --- 2. Contacts API ---
@router.get("/contacts")
def get_contacts(user: dict = Depends(verify_authenticated_user)):
    u_id = user.get("user_id", "default")
    conn = get_db()
    cursor = conn.cursor()
    if IS_POSTGRES:
        cursor.execute("SELECT * FROM contacts WHERE user_id = %s ORDER BY id DESC LIMIT 500", (u_id,))
    else:
        cursor.execute("SELECT * FROM contacts WHERE user_id = ? ORDER BY id DESC LIMIT 500", (u_id,))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

@router.post("/contacts")
def create_contact(contact: ContactCreate, user: dict = Depends(verify_authenticated_user)):
    u_id = user.get("user_id", "default")
    conn = get_db()
    cursor = conn.cursor()
    
    mx_info = check_domain_mx(contact.email)
    mx_valid = 1 if mx_info.get("valid") else 0

    try:
        if IS_POSTGRES:
            cursor.execute("""
                INSERT INTO contacts (user_id, first_name, last_name, email, company_name, title, phone, stage, linkedin_url, mx_valid)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (u_id, contact.first_name, contact.last_name, contact.email, contact.company_name,
                  contact.title, contact.phone, contact.stage, contact.linkedin_url, mx_valid))
        else:
            cursor.execute("""
                INSERT INTO contacts (user_id, first_name, last_name, email, company_name, title, phone, stage, linkedin_url, mx_valid)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (u_id, contact.first_name, contact.last_name, contact.email, contact.company_name,
                  contact.title, contact.phone, contact.stage, contact.linkedin_url, mx_valid))
        conn.commit()
        contact_id = cursor.lastrowid
        conn.close()
        return {"status": "success", "id": contact_id, "mx_valid": mx_valid}
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=f"Email '{contact.email}' already exists or invalid.")

@router.post("/contacts/upload-csv")
async def upload_contacts_csv(file: UploadFile = File(...), user: dict = Depends(verify_authenticated_user)):
    u_id = user.get("user_id", "default")
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported.")

    content = await file.read()
    decoded = content.decode("utf-8-sig", errors="ignore")
    reader = csv.DictReader(io.StringIO(decoded))

    conn = get_db()
    cursor = conn.cursor()

    imported_count = 0
    skipped_count = 0

    for row in reader:
        # Find email field
        email = row.get("Email") or row.get("email") or row.get("EMAIL")
        if not email or "@" not in email:
            skipped_count += 1
            continue

        email = email.strip()
        first_name = row.get("First Name") or row.get("first_name") or ""
        last_name = row.get("Last Name") or row.get("last_name") or ""
        company_name = row.get("Company Name") or row.get("company_name") or ""
        title = row.get("Title") or row.get("title") or ""
        phone = row.get("Phone") or row.get("phone") or ""
        stage = row.get("Stage") or row.get("stage") or ""
        linkedin_url = row.get("Person Linkedin Url") or row.get("linkedin_url") or ""

        # MX Check
        mx_res = check_domain_mx(email)
        mx_valid = 1 if mx_res.get("valid") else 0

        try:
            if IS_POSTGRES:
                cursor.execute("""
                    INSERT INTO contacts (user_id, first_name, last_name, email, company_name, title, phone, stage, linkedin_url, mx_valid)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT(email) DO UPDATE SET
                        first_name=EXCLUDED.first_name,
                        last_name=EXCLUDED.last_name,
                        company_name=EXCLUDED.company_name,
                        title=EXCLUDED.title,
                        phone=EXCLUDED.phone,
                        stage=EXCLUDED.stage,
                        linkedin_url=EXCLUDED.linkedin_url,
                        mx_valid=EXCLUDED.mx_valid
                """, (u_id, first_name.strip(), last_name.strip(), email, company_name.strip(),
                      title.strip(), phone.strip(), stage.strip(), linkedin_url.strip(), mx_valid))
            else:
                cursor.execute("""
                    INSERT INTO contacts (user_id, first_name, last_name, email, company_name, title, phone, stage, linkedin_url, mx_valid)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(email) DO UPDATE SET
                        first_name=excluded.first_name,
                        last_name=excluded.last_name,
                        company_name=excluded.company_name,
                        title=excluded.title,
                        phone=excluded.phone,
                        stage=excluded.stage,
                        linkedin_url=excluded.linkedin_url,
                        mx_valid=excluded.mx_valid
                """, (u_id, first_name.strip(), last_name.strip(), email, company_name.strip(),
                      title.strip(), phone.strip(), stage.strip(), linkedin_url.strip(), mx_valid))
            imported_count += 1
        except Exception:
            skipped_count += 1

    conn.commit()
    conn.close()

    return {"status": "success", "imported": imported_count, "skipped": skipped_count}

# --- 3. Campaigns API ---
@router.get("/campaigns")
def get_campaigns(user: dict = Depends(verify_authenticated_user)):
    u_id = user.get("user_id", "default")
    conn = get_db()
    cursor = conn.cursor()
    if IS_POSTGRES:
        cursor.execute("""
            SELECT c.*, 
                COUNT(cc.id) as total_contacts,
                SUM(CASE WHEN cc.status = 'sent' THEN 1 ELSE 0 END) as sent_count,
                SUM(CASE WHEN cc.status = 'pending' THEN 1 ELSE 0 END) as pending_count,
                SUM(CASE WHEN cc.status = 'failed' THEN 1 ELSE 0 END) as failed_count,
                SUM(CASE WHEN cc.open_count > 0 THEN 1 ELSE 0 END) as open_count
            FROM campaigns c
            LEFT JOIN campaign_contacts cc ON c.id = cc.campaign_id
            WHERE c.user_id = %s
            GROUP BY c.id
            ORDER BY c.id DESC
        """, (u_id,))
    else:
        cursor.execute("""
            SELECT c.*, 
                COUNT(cc.id) as total_contacts,
                SUM(CASE WHEN cc.status = 'sent' THEN 1 ELSE 0 END) as sent_count,
                SUM(CASE WHEN cc.status = 'pending' THEN 1 ELSE 0 END) as pending_count,
                SUM(CASE WHEN cc.status = 'failed' THEN 1 ELSE 0 END) as failed_count,
                SUM(CASE WHEN cc.open_count > 0 THEN 1 ELSE 0 END) as open_count
            FROM campaigns c
            LEFT JOIN campaign_contacts cc ON c.id = cc.campaign_id
            WHERE c.user_id = ?
            GROUP BY c.id
            ORDER BY c.id DESC
        """, (u_id,))
    campaigns = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return campaigns

@router.get("/campaigns/{campaign_id}")
def get_campaign_detail(campaign_id: int, user: dict = Depends(verify_authenticated_user)):
    u_id = user.get("user_id", "default")
    conn = get_db()
    cursor = conn.cursor()
    
    if IS_POSTGRES:
        cursor.execute("SELECT * FROM campaigns WHERE id = %s AND user_id = %s", (campaign_id, u_id))
    else:
        cursor.execute("SELECT * FROM campaigns WHERE id = ? AND user_id = ?", (campaign_id, u_id))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Campaign not found.")

    campaign = dict(row)

    if IS_POSTGRES:
        cursor.execute("""
            SELECT cc.status as send_status, cc.scheduled_time, cc.sent_at, cc.opened_at, cc.open_count, cc.error_message, c.*
            FROM campaign_contacts cc
            JOIN contacts c ON cc.contact_id = c.id
            WHERE cc.campaign_id = %s
        """, (campaign_id,))
        contacts = [dict(r) for r in cursor.fetchall()]

        cursor.execute("SELECT * FROM logs WHERE campaign_id = %s ORDER BY id DESC LIMIT 100", (campaign_id,))
        logs = [dict(r) for r in cursor.fetchall()]
    else:
        cursor.execute("""
            SELECT cc.status as send_status, cc.scheduled_time, cc.sent_at, cc.opened_at, cc.open_count, cc.error_message, c.*
            FROM campaign_contacts cc
            JOIN contacts c ON cc.contact_id = c.id
            WHERE cc.campaign_id = ?
        """, (campaign_id,))
        contacts = [dict(r) for r in cursor.fetchall()]

        cursor.execute("SELECT * FROM logs WHERE campaign_id = ? ORDER BY id DESC LIMIT 100", (campaign_id,))
        logs = [dict(r) for r in cursor.fetchall()]

    conn.close()
    return {"campaign": campaign, "contacts": contacts, "logs": logs}

@router.post("/campaigns")
def create_campaign(campaign: CampaignCreate, user: dict = Depends(verify_authenticated_user)):
    u_id = user.get("user_id", "default")
    conn = get_db()
    cursor = conn.cursor()

    if IS_POSTGRES:
        cursor.execute("""
            INSERT INTO campaigns (user_id, name, subject, body_html, scheduled_at, min_delay_sec, max_delay_sec, batch_size, daily_limit, track_opens, attachment_filename, attachment_path)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (u_id, campaign.name, campaign.subject, campaign.body_html, campaign.scheduled_at,
              campaign.min_delay_sec, campaign.max_delay_sec, campaign.batch_size,
              campaign.daily_limit, 1 if campaign.track_opens else 0,
              campaign.attachment_filename, campaign.attachment_path))
    else:
        cursor.execute("""
            INSERT INTO campaigns (user_id, name, subject, body_html, scheduled_at, min_delay_sec, max_delay_sec, batch_size, daily_limit, track_opens, attachment_filename, attachment_path)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (u_id, campaign.name, campaign.subject, campaign.body_html, campaign.scheduled_at,
              campaign.min_delay_sec, campaign.max_delay_sec, campaign.batch_size,
              campaign.daily_limit, 1 if campaign.track_opens else 0,
              campaign.attachment_filename, campaign.attachment_path))

    campaign_id = cursor.lastrowid

    # Associate contacts
    for contact_id in campaign.contact_ids:
        if IS_POSTGRES:
            cursor.execute("""
                INSERT INTO campaign_contacts (user_id, campaign_id, contact_id, status)
                VALUES (%s, %s, %s, 'pending')
            """, (u_id, campaign_id, contact_id))
        else:
            cursor.execute("""
                INSERT INTO campaign_contacts (user_id, campaign_id, contact_id, status)
                VALUES (?, ?, ?, 'pending')
            """, (u_id, campaign_id, contact_id))

    conn.commit()
    conn.close()

    # Recalculate schedule times for queue items
    recalculate_queue_schedule_times(campaign_id)

    return {"status": "success", "id": campaign_id}

@router.put("/campaigns/{campaign_id}")
def update_campaign(campaign_id: int, campaign: CampaignCreate, user: dict = Depends(verify_authenticated_user)):
    u_id = user.get("user_id", "default")
    conn = get_db()
    cursor = conn.cursor()

    if IS_POSTGRES:
        cursor.execute("SELECT * FROM campaigns WHERE id = %s AND user_id = %s", (campaign_id, u_id))
    else:
        cursor.execute("SELECT * FROM campaigns WHERE id = ? AND user_id = ?", (campaign_id, u_id))
    existing = cursor.fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Campaign not found.")

    if IS_POSTGRES:
        cursor.execute("""
            UPDATE campaigns 
            SET name = %s, subject = %s, body_html = %s, scheduled_at = %s, 
                min_delay_sec = %s, max_delay_sec = %s, batch_size = %s, 
                daily_limit = %s, track_opens = %s, attachment_filename = %s, 
                attachment_path = %s, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s AND user_id = %s
        """, (campaign.name, campaign.subject, campaign.body_html, campaign.scheduled_at,
              campaign.min_delay_sec, campaign.max_delay_sec, campaign.batch_size,
              campaign.daily_limit, 1 if campaign.track_opens else 0,
              campaign.attachment_filename, campaign.attachment_path, campaign_id, u_id))
    else:
        cursor.execute("""
            UPDATE campaigns 
            SET name = ?, subject = ?, body_html = ?, scheduled_at = ?, 
                min_delay_sec = ?, max_delay_sec = ?, batch_size = ?, 
                daily_limit = ?, track_opens = ?, attachment_filename = ?, 
                attachment_path = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?
        """, (campaign.name, campaign.subject, campaign.body_html, campaign.scheduled_at,
              campaign.min_delay_sec, campaign.max_delay_sec, campaign.batch_size,
              campaign.daily_limit, 1 if campaign.track_opens else 0,
              campaign.attachment_filename, campaign.attachment_path, campaign_id, u_id))

    # Sync contacts: remove old pending contacts, keep sent ones, add newly selected ones
    cursor.execute("DELETE FROM campaign_contacts WHERE campaign_id = ? AND status = 'pending'", (campaign_id,))
    
    # Fetch remaining contact_ids
    cursor.execute("SELECT contact_id FROM campaign_contacts WHERE campaign_id = ?", (campaign_id,))
    existing_contacts = {r[0] if not isinstance(r, dict) else r["contact_id"] for r in cursor.fetchall()}

    for contact_id in campaign.contact_ids:
        if contact_id not in existing_contacts:
            if IS_POSTGRES:
                cursor.execute("""
                    INSERT INTO campaign_contacts (user_id, campaign_id, contact_id, status)
                    VALUES (%s, %s, %s, 'pending')
                """, (u_id, campaign_id, contact_id))
            else:
                cursor.execute("""
                    INSERT INTO campaign_contacts (user_id, campaign_id, contact_id, status)
                    VALUES (?, ?, ?, 'pending')
                """, (u_id, campaign_id, contact_id))

    conn.commit()
    conn.close()

    # Recalculate schedule times for queue items
    recalculate_queue_schedule_times(campaign_id)

    return {"status": "updated", "id": campaign_id}

@router.get("/queue")
def get_email_queue(campaign_id: Optional[int] = None, status: Optional[str] = None, user: dict = Depends(verify_authenticated_user)):
    u_id = user.get("user_id", "default")
    conn = get_db()
    cursor = conn.cursor()

    query = """
        SELECT cc.id as cc_id, cc.status as send_status, cc.scheduled_time, cc.sent_at, cc.opened_at, cc.open_count, cc.error_message,
               c.id as campaign_id, c.name as campaign_name, c.subject, c.min_delay_sec, c.max_delay_sec,
               ct.id as contact_id, ct.first_name, ct.last_name, ct.email, ct.company_name, ct.title, ct.mx_valid, ct.is_unsubscribed
        FROM campaign_contacts cc
        JOIN campaigns c ON cc.campaign_id = c.id
        JOIN contacts ct ON cc.contact_id = ct.id
        WHERE cc.user_id = ?
    """
    params = [u_id]
    if campaign_id:
        query += " AND cc.campaign_id = ?"
        params.append(campaign_id)
    if status:
        query += " AND cc.status = ?"
        params.append(status)

    query += " ORDER BY cc.id DESC LIMIT 1000"

    cursor.execute(query, params)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

@router.post("/queue/retry-failed")
def retry_failed_queue(campaign_id: Optional[int] = None, user: dict = Depends(verify_authenticated_user)):
    u_id = user.get("user_id", "default")
    conn = get_db()
    cursor = conn.cursor()
    if campaign_id:
        cursor.execute("UPDATE campaign_contacts SET status = 'pending', error_message = NULL WHERE user_id = ? AND campaign_id = ? AND status = 'failed'", (u_id, campaign_id))
    else:
        cursor.execute("UPDATE campaign_contacts SET status = 'pending', error_message = NULL WHERE user_id = ? AND status = 'failed'", (u_id,))
    conn.commit()
    conn.close()
    return {"status": "retried"}

@router.post("/campaigns/{campaign_id}/start")
@router.post("/campaigns/{campaign_id}/resume")
async def start_or_resume_campaign(campaign_id: int, background_tasks: BackgroundTasks, user: dict = Depends(verify_authenticated_user)):
    u_id = user.get("user_id", "default")
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM campaigns WHERE id = ? AND user_id = ?", (campaign_id, u_id))
    c = cursor.fetchone()
    if not c:
        conn.close()
        raise HTTPException(status_code=404, detail="Campaign not found.")

    cursor.execute("UPDATE campaigns SET status = 'sending', updated_at = CURRENT_TIMESTAMP WHERE id = ?", (campaign_id,))
    conn.commit()
    conn.close()

    worker.resume_campaign(campaign_id)

    if not worker.is_running(campaign_id):
        app_url = get_setting("APP_URL", "http://localhost:8000", user_id=u_id)
        background_tasks.add_task(worker.execute_campaign, campaign_id, app_url)

    return {"status": "sending", "campaign_id": campaign_id}

@router.post("/campaigns/{campaign_id}/pause")
def pause_campaign(campaign_id: int):
    worker.pause_campaign(campaign_id)
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE campaigns SET status = 'paused', updated_at = CURRENT_TIMESTAMP WHERE id = ?", (campaign_id,))
    conn.commit()
    conn.close()
    return {"status": "paused"}

@router.post("/campaigns/{campaign_id}/stop")
def stop_campaign(campaign_id: int):
    worker.stop_campaign(campaign_id)
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE campaigns SET status = 'stopped', updated_at = CURRENT_TIMESTAMP WHERE id = ?", (campaign_id,))
    conn.commit()
    conn.close()
    return {"status": "stopped"}

@router.delete("/campaigns/{campaign_id}")
def delete_campaign(campaign_id: int, user: dict = Depends(verify_authenticated_user)):
    u_id = user.get("user_id", "default")
    worker.stop_campaign(campaign_id)
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM campaign_contacts WHERE campaign_id = ? AND user_id = ?", (campaign_id, u_id))
    cursor.execute("DELETE FROM campaigns WHERE id = ? AND user_id = ?", (campaign_id, u_id))
    cursor.execute("DELETE FROM logs WHERE campaign_id = ? AND user_id = ?", (campaign_id, u_id))
    conn.commit()
    conn.close()
    return {"status": "deleted"}

# --- 4. File Upload (PDF Attachments) ---
@router.post("/attachments/upload")
async def upload_attachment(file: UploadFile = File(...)):
    if not file.filename.lower().endswith((".pdf", ".doc", ".docx")):
        raise HTTPException(status_code=400, detail="Only PDF and document attachments are supported.")

    upload_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "uploads")
    os.makedirs(upload_dir, exist_ok=True)
    
    file_path = os.path.join(upload_dir, file.filename)
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)

    return {
        "filename": file.filename,
        "path": file_path,
        "size_kb": round(len(content) / 1024, 1)
    }

# --- 5. Spam Check & Anti-Spam Tools ---
@router.post("/spam-check")
def run_spam_check(req: SpamCheckRequest):
    return analyze_email_content(req.subject, req.body_html)

@router.get("/domain-audit")
def run_domain_audit(domain: Optional[str] = None, user: dict = Depends(verify_authenticated_user)):
    u_id = user.get("user_id", "default")
    if not domain:
        from_email = get_setting("FROM_EMAIL", "", user_id=u_id)
        if "@" in from_email:
            domain = from_email.split("@")[-1]
        else:
            domain = "gmail.com"
    return audit_sender_domain(domain)

# --- 6. Settings & SMTP Test Connection ---
@router.get("/settings")
def get_smtp_settings(user: dict = Depends(verify_authenticated_user)):
    u_id = user.get("user_id", "default")
    return {
        "smtp_host": get_setting("SMTP_HOST", "smtp.gmail.com", user_id=u_id),
        "smtp_port": int(get_setting("SMTP_PORT", "587", user_id=u_id)),
        "smtp_user": get_setting("SMTP_USER", "", user_id=u_id),
        "smtp_pass": get_setting("SMTP_PASS", "", user_id=user_id),
        "from_name": get_setting("FROM_NAME", "ColdMail Outreach", user_id=u_id),
        "from_email": get_setting("FROM_EMAIL", "", user_id=u_id),
        "app_url": get_setting("APP_URL", "http://localhost:8000", user_id=u_id)
    }

@router.post("/settings")
def save_smtp_settings(settings: SmtpSettingsModel, user: dict = Depends(verify_authenticated_user)):
    u_id = user.get("user_id", "default")
    set_setting("SMTP_HOST", settings.smtp_host, user_id=u_id)
    set_setting("SMTP_PORT", str(settings.smtp_port), user_id=u_id)
    set_setting("SMTP_USER", settings.smtp_user, user_id=u_id)
    set_setting("SMTP_PASS", settings.smtp_pass, user_id=u_id)
    set_setting("FROM_NAME", settings.from_name, user_id=u_id)
    set_setting("FROM_EMAIL", settings.from_email, user_id=u_id)
    set_setting("APP_URL", settings.app_url or "http://localhost:8000", user_id=u_id)
    return {"status": "saved"}

@router.post("/smtp/test")
def test_smtp_connection(req: TestSmtpRequest, user: dict = Depends(verify_authenticated_user)):
    u_id = user.get("user_id", "default")
    smtp_host = get_setting("SMTP_HOST", "smtp.gmail.com", user_id=u_id)
    smtp_port = int(get_setting("SMTP_PORT", "587", user_id=u_id))
    smtp_user = get_setting("SMTP_USER", "", user_id=u_id)
    smtp_pass = get_setting("SMTP_PASS", "", user_id=u_id)
    from_name = get_setting("FROM_NAME", "ColdMail Outreach", user_id=u_id)
    from_email = get_setting("FROM_EMAIL", smtp_user, user_id=u_id)

    if not smtp_user or not smtp_pass:
        raise HTTPException(status_code=400, detail="SMTP credentials are empty. Please save your SMTP username and App Password first.")

    success, err_msg = send_single_email(
        recipient_email=req.test_email,
        subject="🚀 ColdMail Test - SMTP Verification",
        html_body=f"<h3>Hello!</h3><p>Your ColdMail SMTP configuration is working perfectly for <b>{from_email}</b>.</p>",
        text_body="Hello!\nYour ColdMail SMTP configuration is working perfectly.",
        unsubscribe_url="#",
        user_id=u_id
    )

    if success:
        return {"status": "success", "message": f"Test email sent successfully to {req.test_email}!"}
    else:
        raise HTTPException(status_code=500, detail=f"SMTP Handshake Failed: {err_msg}")

# --- 7. Tracking Pixel & Unsubscribe Webhooks ---
# 1x1 Transparent GIF Byte constant
TRANSPARENT_GIF = b'GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;'

@router.get("/track/open/{cc_id}")
def track_email_open(cc_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE campaign_contacts SET open_count = open_count + 1, opened_at = CURRENT_TIMESTAMP WHERE id = ?", (cc_id,))
    conn.commit()
    conn.close()
    return Response(content=TRANSPARENT_GIF, media_type="image/gif")

@router.get("/unsubscribe/{email}")
@router.post("/unsubscribe/{email}")
def unsubscribe_recipient(email: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("INSERT OR REPLACE INTO unsubscribes (email) VALUES (?)", (email,))
    cursor.execute("UPDATE contacts SET is_unsubscribed = 1 WHERE email = ?", (email,))
    conn.commit()
    conn.close()

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head><title>Unsubscribed</title></head>
    <body style="font-family: sans-serif; text-align: center; padding: 40px; background: #0f172a; color: #f8fafc;">
        <div style="max-width: 480px; margin: 0 auto; background: #1e293b; padding: 32px; border-radius: 12px; border: 1px solid #334155;">
            <h2 style="color: #38bdf8;">Unsubscribe Successful</h2>
            <p style="color: #94a3b8;">Your email address <b>{email}</b> has been unsubscribed from future cold mailing campaigns.</p>
        </div>
    </body>
    </html>
    """
    return Response(content=html_content, media_type="text/html")
