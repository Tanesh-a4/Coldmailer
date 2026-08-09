import os
import sys
import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

# Ensure root workspace is on path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server.database import init_db, get_db, get_setting
from server.routes.api import router as api_router
from server.services.email_worker import worker

load_dotenv()

# Initialize DB tables
init_db()

app = FastAPI(
    title="ColdMail Production-Ready Engine",
    description="Anti-Spam Cold Email Platform with PDF Attachments, Domain Deliverability, and Analytics",
    version="1.0.0"
)

# CORS middleware for local Vite frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Router
app.include_router(api_router)

@app.on_event("startup")
async def on_startup():
    """Auto-resumes pending/scheduled campaign workers whenever server starts."""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM campaigns WHERE status IN ('sending', 'scheduled')")
        rows = cursor.fetchall()
        conn.close()

        app_url = get_setting("APP_URL", "http://localhost:8000")
        for r in rows:
            c_id = r["id"] if isinstance(r, dict) or hasattr(r, "__getitem__") else r[0]
            print(f"[STARTUP] Auto-starting worker queue for campaign ID #{c_id}")
            asyncio.create_task(worker.execute_campaign(c_id, app_url))
    except Exception as e:
        print("[STARTUP NOTICE] Could not auto-start campaigns:", e)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server.main:app", host="127.0.0.1", port=8000, reload=True)
