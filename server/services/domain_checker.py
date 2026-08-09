import dns.resolver
from typing import Dict, Any, List

def check_domain_mx(email: str) -> Dict[str, Any]:
    """Validates email format and inspects MX DNS records."""
    if not email or "@" not in email:
        return {"valid": False, "reason": "Invalid email address format"}

    domain = email.split("@")[-1].strip()
    if not domain:
        return {"valid": False, "reason": "Missing domain"}

    try:
        answers = dns.resolver.resolve(domain, 'MX')
        mx_records = [str(r.exchange) for r in answers]
        if mx_records:
            return {
                "valid": True,
                "domain": domain,
                "mx_records": mx_records,
                "reason": f"Found {len(mx_records)} valid MX records"
            }
        else:
            return {"valid": False, "domain": domain, "reason": "No MX records found"}
    except Exception as e:
        return {
            "valid": False,
            "domain": domain,
            "reason": f"MX lookup failed: {str(e)}"
        }

def audit_sender_domain(domain: str) -> Dict[str, Any]:
    """Audits sender domain for SPF, DKIM (default selectors), and DMARC DNS records."""
    domain = domain.strip().lower()
    results = {
        "domain": domain,
        "mx": {"status": "Unknown", "records": [], "details": ""},
        "spf": {"status": "Missing", "record": "", "details": "No SPF TXT record detected"},
        "dmarc": {"status": "Missing", "record": "", "details": "No DMARC TXT record found at _dmarc." + domain},
        "dkim": {"status": "Info", "details": "DKIM verification depends on your specific SMTP provider selector (e.g. google._domainkey)."},
        "overall_score": 0,
        "recommendations": []
    }

    # 1. MX Check
    try:
        mx_answers = dns.resolver.resolve(domain, 'MX')
        mx_recs = [str(r.exchange) for r in mx_answers]
        results["mx"] = {
            "status": "Pass" if mx_recs else "Fail",
            "records": mx_recs,
            "details": f"Active mail exchangers found ({len(mx_recs)})"
        }
        results["overall_score"] += 30
    except Exception as e:
        results["mx"] = {"status": "Fail", "records": [], "details": str(e)}
        results["recommendations"].append(f"Domain '{domain}' does not have MX records configured.")

    # 2. SPF Check
    try:
        txt_answers = dns.resolver.resolve(domain, 'TXT')
        spf_found = False
        for r in txt_answers:
            txt_val = str(r).strip('"')
            if txt_val.startswith("v=spf1"):
                spf_found = True
                results["spf"] = {
                    "status": "Pass",
                    "record": txt_val,
                    "details": "Valid SPF policy found in DNS"
                }
                results["overall_score"] += 35
                break
        if not spf_found:
            results["recommendations"].append("Add an SPF TXT record (v=spf1 ...) to authorize your mail server IP.")
    except Exception as e:
        results["spf"] = {"status": "Fail", "record": "", "details": str(e)}
        results["recommendations"].append("SPF check failed or DNS timed out.")

    # 3. DMARC Check
    try:
        dmarc_domain = f"_dmarc.{domain}"
        dmarc_answers = dns.resolver.resolve(dmarc_domain, 'TXT')
        dmarc_found = False
        for r in dmarc_answers:
            txt_val = str(r).strip('"')
            if txt_val.startswith("v=DMARC1"):
                dmarc_found = True
                results["dmarc"] = {
                    "status": "Pass",
                    "record": txt_val,
                    "details": "Valid DMARC policy found"
                }
                results["overall_score"] += 35
                break
        if not dmarc_found:
            results["recommendations"].append("Add a DMARC TXT record at _dmarc." + domain + " to prevent email spoofing.")
    except Exception as e:
        results["dmarc"] = {"status": "Missing", "record": "", "details": "No DMARC TXT record found."}
        results["recommendations"].append("Configuring DMARC boosts deliverability for cold outreach.")

    if results["overall_score"] >= 85:
        results["health_status"] = "Excellent Deliverability Readiness"
    elif results["overall_score"] >= 60:
        results["health_status"] = "Good (Minor DNS Tweaks Suggested)"
    else:
        results["health_status"] = "Poor (Emails May Hit Spam/Bounce)"

    return results
