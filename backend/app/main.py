import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import engine, Base
from app.models import User, Lead, Message, ChatMessage
from app.api.auth import router as auth_router
from app.api.dashboard import router as dashboard_router
from app.api.leads import router as leads_router
from app.api.messaging import router as messaging_router
from app.api.agent import router as agent_router
from app.api.whatsapp import router as whatsapp_router
from app.api.simulator import router as simulator_router
from app.api.settings import router as settings_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("outreach_master")


import os
from sqlalchemy import inspect, text

def migrate_database_schema(connection):
    try:
        inspector = inspect(connection)
        columns = [col["name"] for col in inspector.get_columns("messages")]
        if "media_url" not in columns:
            logger.info("Migrating schema: adding media_url column to messages table...")
            connection.execute(text("ALTER TABLE messages ADD COLUMN media_url VARCHAR(500)"))
        if "media_duration" not in columns:
            logger.info("Migrating schema: adding media_duration column to messages table...")
            connection.execute(text("ALTER TABLE messages ADD COLUMN media_duration INTEGER"))
    except Exception as e:
        logger.warning("Database schema migration error: %s", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing database tables...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(migrate_database_schema)

    # Ensure voice notes media directory exists
    media_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "media", "voice_notes"))
    os.makedirs(media_dir, exist_ok=True)

    # Self-healing migration: sanitize phone numbers and merge split threads
    try:
        from app.core.database import AsyncSessionLocal
        from app.services.lead_service import sanitize_and_merge_existing_leads
        async with AsyncSessionLocal() as session:
            await sanitize_and_merge_existing_leads(session)
    except Exception as e:
        logger.warning("Startup lead sanitization/deduplication warning: %s", e)

    yield
    logger.info("Shutting down Outreach Master backend...")


app = FastAPI(
    title=settings.PROJECT_NAME,
    lifespan=lifespan,
    docs_url=f"{settings.API_V1_STR}/docs",
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins for local dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(auth_router, prefix=settings.API_V1_STR)
app.include_router(dashboard_router, prefix=settings.API_V1_STR)
app.include_router(leads_router, prefix=settings.API_V1_STR)
app.include_router(messaging_router, prefix=settings.API_V1_STR)
app.include_router(agent_router, prefix=settings.API_V1_STR)
app.include_router(whatsapp_router, prefix=settings.API_V1_STR)
app.include_router(simulator_router, prefix=settings.API_V1_STR)
app.include_router(settings_router, prefix=settings.API_V1_STR)


@app.get("/health")
async def health_check():
    return {"status": "ok", "app": settings.PROJECT_NAME}
