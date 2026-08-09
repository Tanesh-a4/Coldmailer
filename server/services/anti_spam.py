import re
import html
import datetime
from typing import Dict, Any, List

SPAM_KEYWORDS = {
    "Financial & Promises": [
        "100% free", "act now", "apply now", "as seen on", "buy direct", "cash bonus",
        "cheap", "credit card offers", "double your income", "earn extra cash",
        "earn money", "fast cash", "financial freedom", "free access", "free gift",
        "free info", "free money", "free sample", "free trial", "full refund",
        "get paid", "guaranteed", "income from home", "increase sales", "investment",
        "make money", "million dollars", "money back", "no cost", "no fees",
        "no hidden costs", "no risk", "no strings attached", "risk free", "save money",
        "special promotion", "unlimited", "winner"
    ],
    "Urgency & Pressure": [
        "urgent", "action required", "apply now", "call now", "don't hesitate",
        "exclusive deal", "expire", "expires today", "for a limited time", "immediate",
        "instant", "last chance", "limited time", "now only", "offer expires",
        "once in a lifetime", "time limited", "what are you waiting for"
    ],
    "Over-promising & Hype": [
        "100% satisfied", "amazing", "be your own boss", "best price", "billion",
        "cure", "drastically reduce", "fantastic", "free consultation", "freedom",
        "incredible deal", "miracle", "no experience required", "promise",
        "pure profit", "real thing", "satisfaction guaranteed", "secret",
        "special offer", "stop snoring", "success", "unbelievable"
    ],
    "Spammy Formatting": [
        "click here", "click below", "click now", "open immediately", "read this",
        "see for yourself", "check this out", "visit our website"
    ]
}

def analyze_email_content(subject: str, body_html: str) -> Dict[str, Any]:
    score = 0.0
    triggers_found = []
    recommendations = []
    
    clean_body = re.sub(r'<[^>]+>', ' ', body_html)
    full_text = f"{subject} {clean_body}".lower()
    
    # 1. Keyword check
    for category, words in SPAM_KEYWORDS.items():
        for word in words:
            pattern = r'\b' + re.escape(word) + r'\b'
            matches = re.findall(pattern, full_text)
            if matches:
                count = len(matches)
                score += 0.8 * count
                triggers_found.append({"word": word, "category": category, "count": count})
    
    # 2. Subject caps check
    if len(subject) > 3:
        caps_in_subject = sum(1 for c in subject if c.isupper())
        subject_caps_ratio = caps_in_subject / len(subject)
        if subject_caps_ratio > 0.4:
            score += 2.0
            triggers_found.append({"word": "Excessive Subject Caps", "category": "Formatting", "count": 1})
            recommendations.append("Reduce ALL CAPS in the subject line.")
            
    # 3. Excessive Exclamation Marks
    exclamations = subject.count('!') + clean_body.count('!')
    if exclamations > 2:
        score += min(2.0, exclamations * 0.5)
        triggers_found.append({"word": f"{exclamations} Exclamation Marks", "category": "Formatting", "count": exclamations})
        recommendations.append("Limit exclamation points to 1 or none.")

    # 4. Personalization Check
    has_personalization = bool(re.search(r'\{\{\s*(First Name|first_name|Company Name|company_name|Title|title)\s*\}\}', body_html, re.IGNORECASE))
    if not has_personalization:
        score += 1.5
        recommendations.append("Include dynamic tags like {{First Name}} or {{Company Name}} to increase engagement and lower spam rating.")
    else:
        score = max(0.0, score - 0.5)
        
    # 5. Link Density
    links = re.findall(r'href=[\'"]?([^\'" >]+)', body_html)
    word_count = len(clean_body.split())
    if word_count > 0:
        link_ratio = len(links) / (word_count / 50.0 + 1)
        if link_ratio > 3:
            score += 1.5
            recommendations.append("Too many links relative to email length. Aim for 1-2 links max in cold outreach.")
            
    # Normalize score 0 - 10
    final_score = min(10.0, round(score, 1))
    
    if final_score < 2.5:
        risk_level = "Low Risk (Deliverability Excellent)"
        color = "green"
    elif final_score < 5.5:
        risk_level = "Moderate Risk (Needs Tweak)"
        color = "amber"
    else:
        risk_level = "High Spam Risk (Likely to hit Spam Box)"
        color = "red"
        
    if not recommendations:
        recommendations.append("Your email content follows cold email deliverability best practices!")

    return {
        "spam_score": final_score,
        "risk_level": risk_level,
        "color": color,
        "triggers_found": triggers_found,
        "recommendations": recommendations,
        "word_count": word_count,
        "link_count": len(links)
    }

def check_google_account_safety(sender_email: str = "") -> Dict[str, Any]:
    """Calculates emails sent in the last 24 hours and evaluates Google Account ban risk."""
    from server.database import get_db, IS_POSTGRES
    conn = get_db()
    cursor = conn.cursor()

    if IS_POSTGRES:
        cursor.execute("SELECT COUNT(*) as sent_24h FROM campaign_contacts WHERE status = 'sent' AND sent_at >= NOW() - INTERVAL '24 hours'")
    else:
        cursor.execute("SELECT COUNT(*) as sent_24h FROM campaign_contacts WHERE status = 'sent' AND sent_at >= datetime('now', '-1 day')")

    row = cursor.fetchone()
    conn.close()

    sent_24h = row["sent_24h"] if row and "sent_24h" in row else 0

    # Account Type Detection
    is_free_gmail = sender_email.lower().endswith("@gmail.com") or not sender_email
    max_safe_daily = 100 if is_free_gmail else 200
    hard_limit = 450 if is_free_gmail else 1800

    remaining_safe = max(0, max_safe_daily - sent_24h)

    if sent_24h >= max_safe_daily:
        status = "Limit Exceeded (Cool-off Active)"
        badge_color = "red"
        can_send = False
        message = f"Daily safety threshold ({max_safe_daily} emails/24h) reached for {sender_email or 'Google Account'}. Dispatches are paused to prevent Google ban."
    elif sent_24h >= int(max_safe_daily * 0.75):
        status = "High Volume (Near Daily Threshold)"
        badge_color = "amber"
        can_send = True
        message = f"You have sent {sent_24h}/{max_safe_daily} emails in the last 24 hours. Ensure min delay is at least 60s."
    else:
        status = "Account Safe (Shielded)"
        badge_color = "green"
        can_send = True
        message = f"Google account safety shield active. {sent_24h} sent in last 24h ({remaining_safe} remaining safe allocation)."

    return {
        "sent_24h": sent_24h,
        "max_safe_daily": max_safe_daily,
        "remaining_safe": remaining_safe,
        "hard_limit": hard_limit,
        "is_free_gmail": is_free_gmail,
        "account_type": "Free Gmail (@gmail.com)" if is_free_gmail else "Google Workspace / Custom Domain",
        "status": status,
        "badge_color": badge_color,
        "can_send": can_send,
        "message": message
    }

def html_to_plain_text(html_content: str) -> str:
    """Converts HTML email to clean plain text for multipart fallback."""
    text = re.sub(r'<br\s*/?>', '\n', html_content, flags=re.IGNORECASE)
    text = re.sub(r'</p>', '\n\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</div>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</li>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'<[^>]+>', '', text)
    text = html.unescape(text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

def personalize_template(template_str: str, contact: Dict[str, Any]) -> str:
    """Replaces placeholders like {{First Name}} with contact values."""
    if not template_str:
        return ""

    def replace_var(match):
        var_name = match.group(1).strip()
        norm_map = {
            "first name": contact.get("first_name") or "there",
            "firstname": contact.get("first_name") or "there",
            "last name": contact.get("last_name") or "",
            "lastname": contact.get("last_name") or "",
            "email": contact.get("email") or "",
            "company name": contact.get("company_name") or "your company",
            "company": contact.get("company_name") or "your company",
            "companyname": contact.get("company_name") or "your company",
            "title": contact.get("title") or "Team Member",
            "phone": contact.get("phone") or "",
            "stage": contact.get("stage") or "",
            "linkedin url": contact.get("linkedin_url") or "",
        }
        
        lookup_key = var_name.lower()
        if lookup_key in norm_map:
            val = norm_map[lookup_key]
            return str(val) if val is not None else ""
        
        for k, v in contact.items():
            if k and str(k).lower() == lookup_key:
                return str(v) if v is not None else ""
                
        return match.group(0)

    result = re.sub(r'\{\{\s*([^{}]+)\s*\}\}', replace_var, template_str)
    return result

def append_unsubscribe_footer(html_body: str, unsubscribe_url: str) -> str:
    """Appends compliant opt-out footer to HTML email."""
    opt_out_html = f"""
    <br><br>
    <div style="margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #6b7280; font-family: sans-serif;">
        You are receiving this email as part of our direct business outreach. 
        If you prefer not to receive future communications, you may <a href="{unsubscribe_url}" style="color: #4f46e5; text-decoration: underline;">unsubscribe here</a>.
    </div>
    """
    return html_body + opt_out_html
