"""
AlveolaAI FastAPI Backend
Run: uvicorn main:app --reload --port 8000
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from routes import analyze, feedback, health
from utils.inference import load_model
import os

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load YOLOv8 model on startup
    load_model(os.getenv("MODEL_PATH", "models/best_model.pt"))
    yield

app = FastAPI(
    title="AlveolaAI API",
    description="AI-powered chest X-ray pneumonia detection",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze.router,  prefix="/api", tags=["Analysis"])
app.include_router(feedback.router, prefix="/api", tags=["Feedback"])
app.include_router(health.router,   prefix="/api", tags=["Health"])
