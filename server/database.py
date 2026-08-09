import sqlite3
import os
import datetime
from typing import Dict, Any, List, Optional

DB_PATH = os.path.join(os.path.dirname(__file__), "data", "coldmail.db")
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

# Check if PostgreSQL is requested via DATABASE_URL
IS_POSTGRES = DATABASE_URL.startswith("postgres://") or DATABASE_URL.startswith("postgresql://")

if IS_POSTGRES:
    import psycopg2
    from psycopg2.extras import RealDictCursor

def get_db():
    if IS_POSTGRES:
        pg_url = DATABASE_URL.replace("postgres://", "postgresql://", 1)
        conn = psycopg2.connect(pg_url, cursor_factory=RealDictCursor)
        return conn
    else:
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        conn = sqlite3.connect(DB_PATH, timeout=30)
        conn.row_factory = sqlite3.Row
        return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    
    if IS_POSTGRES:
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS contacts (
            id SERIAL PRIMARY KEY,
            user_id TEXT DEFAULT 'default',
            first_name TEXT,
            last_name TEXT,
            email TEXT NOT NULL,
            company_name TEXT,
            title TEXT,
            phone TEXT,
            stage TEXT,
            linkedin_url TEXT,
            mx_valid INTEGER DEFAULT 1,
            is_unsubscribed INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS campaigns (
            id SERIAL PRIMARY KEY,
            user_id TEXT DEFAULT 'default',
            name TEXT NOT NULL,
            subject TEXT NOT NULL,
            body_html TEXT NOT NULL,
            status TEXT DEFAULT 'draft',
            scheduled_at TIMESTAMP,
            min_delay_sec INTEGER DEFAULT 30,
            max_delay_sec INTEGER DEFAULT 90,
            batch_size INTEGER DEFAULT 50,
            daily_limit INTEGER DEFAULT 200,
            track_opens INTEGER DEFAULT 1,
            attachment_filename TEXT,
            attachment_path TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS campaign_contacts (
            id SERIAL PRIMARY KEY,
            user_id TEXT DEFAULT 'default',
            campaign_id INTEGER NOT NULL,
            contact_id INTEGER NOT NULL,
            status TEXT DEFAULT 'pending',
            scheduled_time TIMESTAMP,
            sent_at TIMESTAMP,
            opened_at TIMESTAMP,
            open_count INTEGER DEFAULT 0,
            error_message TEXT,
            FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE,
            FOREIGN KEY (contact_id) REFERENCES contacts (id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS unsubscribes (
            id SERIAL PRIMARY KEY,
            user_id TEXT DEFAULT 'default',
            email TEXT NOT NULL,
            reason TEXT,
            unsubscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS logs (
            id SERIAL PRIMARY KEY,
            user_id TEXT DEFAULT 'default',
            campaign_id INTEGER,
            contact_id INTEGER,
            level TEXT DEFAULT 'INFO',
            message TEXT NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS settings (
            user_id TEXT DEFAULT 'default',
            key TEXT NOT NULL,
            value TEXT,
            PRIMARY KEY (user_id, key)
        );
        """)
    else:
        # SQLite schema
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT DEFAULT 'default',
            first_name TEXT,
            last_name TEXT,
            email TEXT NOT NULL,
            company_name TEXT,
            title TEXT,
            phone TEXT,
            stage TEXT,
            linkedin_url TEXT,
            mx_valid INTEGER DEFAULT 1,
            is_unsubscribed INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS campaigns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT DEFAULT 'default',
            name TEXT NOT NULL,
            subject TEXT NOT NULL,
            body_html TEXT NOT NULL,
            status TEXT DEFAULT 'draft',
            scheduled_at TIMESTAMP,
            min_delay_sec INTEGER DEFAULT 30,
            max_delay_sec INTEGER DEFAULT 90,
            batch_size INTEGER DEFAULT 50,
            daily_limit INTEGER DEFAULT 200,
            track_opens INTEGER DEFAULT 1,
            attachment_filename TEXT,
            attachment_path TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS campaign_contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT DEFAULT 'default',
            campaign_id INTEGER NOT NULL,
            contact_id INTEGER NOT NULL,
            status TEXT DEFAULT 'pending',
            scheduled_time TIMESTAMP,
            sent_at TIMESTAMP,
            opened_at TIMESTAMP,
            open_count INTEGER DEFAULT 0,
            error_message TEXT,
            FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE,
            FOREIGN KEY (contact_id) REFERENCES contacts (id) ON DELETE CASCADE
        )
        """)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS unsubscribes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT DEFAULT 'default',
            email TEXT NOT NULL,
            reason TEXT,
            unsubscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT DEFAULT 'default',
            campaign_id INTEGER,
            contact_id INTEGER,
            level TEXT DEFAULT 'INFO',
            message TEXT NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            user_id TEXT DEFAULT 'default',
            key TEXT NOT NULL,
            value TEXT,
            PRIMARY KEY (user_id, key)
        )
        """)

    conn.commit()

    # Multi-tenant user_id column migrations for existing databases
    for table_name in ["contacts", "campaigns", "campaign_contacts", "unsubscribes", "logs", "settings"]:
        try:
            cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN user_id TEXT DEFAULT 'default';")
        except Exception:
            pass

    try:
        cursor.execute("ALTER TABLE campaign_contacts ADD COLUMN scheduled_time TIMESTAMP;")
    except Exception:
        pass

    conn.commit()
    conn.close()
    
    # Recalculate schedule times for existing pending queue items
    recalculate_all_pending_schedules()

def recalculate_queue_schedule_times(campaign_id: int):
    """Calculates and stores estimated scheduled execution times for pending contacts in a campaign."""
    conn = get_db()
    cursor = conn.cursor()

    if IS_POSTGRES:
        cursor.execute("SELECT * FROM campaigns WHERE id = %s", (campaign_id,))
    else:
        cursor.execute("SELECT * FROM campaigns WHERE id = ?", (campaign_id,))
    
    row = cursor.fetchone()
    if not row:
        conn.close()
        return

    campaign = dict(row)
    min_delay = campaign.get("min_delay_sec") or 30
    max_delay = campaign.get("max_delay_sec") or 90
    avg_delay = (min_delay + max_delay) / 2.0

    # Base start time
    now_dt = datetime.datetime.now()
    scheduled_at_str = campaign.get("scheduled_at")

    if scheduled_at_str:
        try:
            scheduled_at_str_clean = str(scheduled_at_str).replace('Z', '').replace('T', ' ')
            base_dt = datetime.datetime.fromisoformat(scheduled_at_str_clean)
            if base_dt < now_dt:
                base_dt = now_dt
        except Exception:
            base_dt = now_dt
    else:
        base_dt = now_dt

    if IS_POSTGRES:
        cursor.execute("""
            SELECT id FROM campaign_contacts 
            WHERE campaign_id = %s AND status = 'pending' 
            ORDER BY id ASC
        """, (campaign_id,))
    else:
        cursor.execute("""
            SELECT id FROM campaign_contacts 
            WHERE campaign_id = ? AND status = 'pending' 
            ORDER BY id ASC
        """, (campaign_id,))

    pending_items = cursor.fetchall()

    for idx, item in enumerate(pending_items):
        cc_id = item["id"] if isinstance(item, dict) or hasattr(item, "__getitem__") else item[0]
        calc_dt = base_dt + datetime.timedelta(seconds=idx * avg_delay)
        calc_str = calc_dt.strftime("%Y-%m-%d %H:%M:%S")

        if IS_POSTGRES:
            cursor.execute("UPDATE campaign_contacts SET scheduled_time = %s WHERE id = %s", (calc_str, cc_id))
        else:
            cursor.execute("UPDATE campaign_contacts SET scheduled_time = ? WHERE id = ?", (calc_str, cc_id))

    conn.commit()
    conn.close()

def recalculate_all_pending_schedules():
    """Recalculates schedules for all campaigns with pending items."""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT campaign_id FROM campaign_contacts WHERE status = 'pending'")
        campaign_ids = [r["campaign_id"] if isinstance(r, dict) or hasattr(r, "__getitem__") else r[0] for r in cursor.fetchall()]
        conn.close()

        for c_id in campaign_ids:
            recalculate_queue_schedule_times(c_id)
    except Exception as e:
        print("Schedule recalculation notice:", e)

def get_setting(key: str, default: str = "", user_id: str = "default") -> str:
    conn = get_db()
    cursor = conn.cursor()
    if IS_POSTGRES:
        cursor.execute("SELECT value FROM settings WHERE key = %s AND user_id = %s", (key, user_id))
    else:
        cursor.execute("SELECT value FROM settings WHERE key = ? AND user_id = ?", (key, user_id))
    row = cursor.fetchone()
    conn.close()
    if row and row["value"] is not None:
        return row["value"]
    return os.getenv(key, default)

def set_setting(key: str, value: str, user_id: str = "default"):
    conn = get_db()
    cursor = conn.cursor()
    if IS_POSTGRES:
        cursor.execute("""
            INSERT INTO settings (user_id, key, value) 
            VALUES (%s, %s, %s) 
            ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value
        """, (user_id, key, value))
    else:
        cursor.execute("INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (?, ?, ?)", (user_id, key, value))
    conn.commit()
    conn.close()

def log_event(campaign_id: Optional[int], contact_id: Optional[int], level: str, message: str, user_id: str = "default"):
    conn = get_db()
    cursor = conn.cursor()
    if IS_POSTGRES:
        cursor.execute("INSERT INTO logs (user_id, campaign_id, contact_id, level, message) VALUES (%s, %s, %s, %s, %s)",
                       (user_id, campaign_id, contact_id, level, message))
    else:
        cursor.execute("INSERT INTO logs (user_id, campaign_id, contact_id, level, message) VALUES (?, ?, ?, ?, ?)",
                       (user_id, campaign_id, contact_id, level, message))
    conn.commit()
    conn.close()
