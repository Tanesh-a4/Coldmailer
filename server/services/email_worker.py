import asyncio
import smtplib
import random
import time
import os
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
from typing import Dict, Any, Optional

from server.database import get_db, get_setting, log_event
from server.services.anti_spam import html_to_plain_text, personalize_template, append_unsubscribe_footer, check_google_account_safety

class CampaignWorker:
    def __init__(self):
        self._running_campaigns = set()
        self._paused_campaigns = set()

    def is_running(self, campaign_id: int) -> bool:
        return campaign_id in self._running_campaigns

    def is_paused(self, campaign_id: int) -> bool:
        return campaign_id in self._paused_campaigns

    def pause_campaign(self, campaign_id: int):
        self._paused_campaigns.add(campaign_id)

    def resume_campaign(self, campaign_id: int):
        self._paused_campaigns.discard(campaign_id)

    def stop_campaign(self, campaign_id: int):
        self._running_campaigns.discard(campaign_id)
        self._paused_campaigns.discard(campaign_id)

    async def execute_campaign(self, campaign_id: int, app_url: str = "http://localhost:8000"):
        if campaign_id in self._running_campaigns and campaign_id not in self._paused_campaigns:
            return

        self._running_campaigns.add(campaign_id)
        self._paused_campaigns.discard(campaign_id)

        conn = get_db()
        cursor = conn.cursor()

        # Update campaign status in database
        cursor.execute("UPDATE campaigns SET status = 'sending', updated_at = CURRENT_TIMESTAMP WHERE id = ?", (campaign_id,))
        conn.commit()

        # Fetch campaign details
        cursor.execute("SELECT * FROM campaigns WHERE id = ?", (campaign_id,))
        campaign = cursor.fetchone()

        if not campaign:
            self._running_campaigns.discard(campaign_id)
            conn.close()
            return

        # Fetch pending recipients
        cursor.execute("""
            SELECT cc.id as cc_id, c.* 
            FROM campaign_contacts cc
            JOIN contacts c ON cc.contact_id = c.id
            WHERE cc.campaign_id = ? AND cc.status = 'pending' AND c.is_unsubscribed = 0 AND c.mx_valid = 1
            ORDER BY cc.id ASC
        """, (campaign_id,))
        recipients = cursor.fetchall()

        log_event(campaign_id, None, "INFO", f"Started sending campaign '{campaign['name']}' to {len(recipients)} pending valid recipients.")

        min_delay = campaign["min_delay_sec"] or 30
        max_delay = campaign["max_delay_sec"] or 90
        attachment_path = campaign["attachment_path"]
        attachment_filename = campaign["attachment_filename"]

        for idx, r in enumerate(recipients):
            # Check if campaign stopped
            if campaign_id not in self._running_campaigns:
                log_event(campaign_id, None, "INFO", "Campaign execution stopped.")
                break

            # Handle pause state
            while campaign_id in self._paused_campaigns:
                log_event(campaign_id, None, "INFO", "Campaign paused. Waiting to resume...")
                await asyncio.sleep(3)
                if campaign_id not in self._running_campaigns:
                    break

            if campaign_id not in self._running_campaigns:
                break

            c_user_id = campaign.get("user_id", "default") if isinstance(campaign, dict) or hasattr(campaign, "__getitem__") else "default"

            # Check Google Account Daily Safety Limit
            from_email = get_setting("FROM_EMAIL", "", user_id=c_user_id)
            safety = check_google_account_safety(from_email)
            if not safety["can_send"]:
                log_event(campaign_id, None, "WARN", f"Google Account Safety Guard: {safety['message']}. Campaign auto-paused to protect account.", user_id=c_user_id)
                self._paused_campaigns.add(campaign_id)
                conn_guard = get_db()
                cur_guard = conn_guard.cursor()
                cur_guard.execute("UPDATE campaigns SET status = 'paused', updated_at = CURRENT_TIMESTAMP WHERE id = ?", (campaign_id,))
                conn_guard.commit()
                conn_guard.close()
                break

            contact_dict = dict(r)
            contact_email = contact_dict["email"]
            cc_id = contact_dict["cc_id"]

            # Personalize subject & body
            personalized_subject = personalize_template(campaign["subject"], contact_dict)
            personalized_body = personalize_template(campaign["body_html"], contact_dict)

            # Unsubscribe URL & Footer
            unsubscribe_url = f"{app_url}/api/unsubscribe/{contact_email}"
            final_html = append_unsubscribe_footer(personalized_body, unsubscribe_url)

            # Open tracking pixel insertion
            if campaign["track_opens"]:
                pixel_url = f"{app_url}/api/track/open/{cc_id}"
                pixel_tag = f'<img src="{pixel_url}" alt="" width="1" height="1" style="display:none !important;" />'
                final_html += pixel_tag

            plain_text_fallback = html_to_plain_text(final_html)

            # Send Email
            success, err_msg = send_single_email(
                recipient_email=contact_email,
                subject=personalized_subject,
                html_body=final_html,
                text_body=plain_text_fallback,
                unsubscribe_url=unsubscribe_url,
                attachment_path=attachment_path,
                attachment_filename=attachment_filename,
                user_id=c_user_id
            )

            conn_local = get_db()
            cur_local = conn_local.cursor()

            if success:
                cur_local.execute("""
                    UPDATE campaign_contacts 
                    SET status = 'sent', sent_at = CURRENT_TIMESTAMP 
                    WHERE id = ?
                """, (cc_id,))
                log_event(campaign_id, contact_dict["id"], "INFO", f"Successfully sent email to {contact_email}")
            else:
                cur_local.execute("""
                    UPDATE campaign_contacts 
                    SET status = 'failed', error_message = ? 
                    WHERE id = ?
                """, (err_msg, cc_id))
                log_event(campaign_id, contact_dict["id"], "ERROR", f"Failed sending to {contact_email}: {err_msg}")

            conn_local.commit()
            conn_local.close()

            # Random anti-spam delay jitter (if more emails remain and not paused/stopped)
            if idx < len(recipients) - 1:
                delay = random.randint(min_delay, max_delay)
                log_event(campaign_id, None, "INFO", f"Anti-Spam Delay: Waiting {delay} seconds before next send...")
                
                # Sleep in short ticks so pause/stop responds immediately!
                for _ in range(delay):
                    if campaign_id not in self._running_campaigns or campaign_id in self._paused_campaigns:
                        break
                    await asyncio.sleep(1)

        # Update final state in database
        conn_final = get_db()
        cur_final = conn_final.cursor()

        cur_final.execute("SELECT COUNT(*) as pending FROM campaign_contacts WHERE campaign_id = ? AND status = 'pending'", (campaign_id,))
        row_pending = cur_final.fetchone()
        pending_left = row_pending["pending"] if row_pending else 0

        if pending_left == 0:
            cur_final.execute("UPDATE campaigns SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?", (campaign_id,))
            log_event(campaign_id, None, "INFO", f"Campaign '{campaign['name']}' completed all recipient sends.")
        elif campaign_id in self._paused_campaigns:
            cur_final.execute("UPDATE campaigns SET status = 'paused', updated_at = CURRENT_TIMESTAMP WHERE id = ?", (campaign_id,))
        else:
            cur_final.execute("UPDATE campaigns SET status = 'stopped', updated_at = CURRENT_TIMESTAMP WHERE id = ?", (campaign_id,))

        conn_final.commit()
        conn_final.close()

        self._running_campaigns.discard(campaign_id)
        self._paused_campaigns.discard(campaign_id)

def send_single_email(
    recipient_email: str,
    subject: str,
    html_body: str,
    text_body: str,
    unsubscribe_url: str,
    attachment_path: Optional[str] = None,
    attachment_filename: Optional[str] = None,
    user_id: str = "default"
) -> (bool, str):
    """Sends a single MIME multipart email with anti-spam headers and optional attachment."""
    smtp_host = get_setting("SMTP_HOST", "smtp.gmail.com", user_id=user_id)
    smtp_port = int(get_setting("SMTP_PORT", "587", user_id=user_id))
    smtp_user = get_setting("SMTP_USER", "", user_id=user_id)
    smtp_pass = get_setting("SMTP_PASS", "", user_id=user_id)
    from_name = get_setting("FROM_NAME", "ColdMail Outreach", user_id=user_id)
    from_email = get_setting("FROM_EMAIL", smtp_user, user_id=user_id)

    if not smtp_user or not smtp_pass:
        return False, "SMTP credentials missing in Settings"

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{from_name} <{from_email}>"
        msg["To"] = recipient_email

        # Anti-spam RFC 8058 & Unsubscribe headers
        msg["List-Unsubscribe"] = f"<{unsubscribe_url}>"
        msg["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
        msg["X-Report-Abuse-To"] = from_email
        msg["Auto-Submitted"] = "auto-generated"

        # Attach text & html parts
        part_text = MIMEText(text_body, "plain", "utf-8")
        part_html = MIMEText(html_body, "html", "utf-8")

        msg.attach(part_text)
        msg.attach(part_html)

        # PDF Attachment
        if attachment_path and os.path.exists(attachment_path):
            with open(attachment_path, "rb") as f:
                pdf_data = f.read()
            filename = attachment_filename or os.path.basename(attachment_path)
            part_pdf = MIMEApplication(pdf_data, Name=filename)
            part_pdf['Content-Disposition'] = f'attachment; filename="{filename}"'
            
            # Encapsulate as mixed if attachment present
            outer_msg = MIMEMultipart("mixed")
            for k, v in msg.items():
                outer_msg[k] = v
            outer_msg.attach(msg)
            outer_msg.attach(part_pdf)
            final_send_msg = outer_msg
        else:
            final_send_msg = msg

        # SMTP Dispatch
        if smtp_port == 465:
            server = smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=15)
        else:
            server = smtplib.SMTP(smtp_host, smtp_port, timeout=15)
            server.starttls()

        server.login(smtp_user, smtp_pass)
        server.send_message(final_send_msg)
        server.quit()

        return True, ""
    except Exception as e:
        return False, str(e)

# Global Worker Singleton instance
worker = CampaignWorker()
