"""
Pydantic schemas — request & response models for all API endpoints.
These drive both FastAPI validation and OpenAPI documentation.
"""
from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Optional, List
import uuid, datetime


# ─── Shared sub-models ───────────────────────────────────────────────────────

class BoundingBox(BaseModel):
    """One detected opacity region."""
    id:         int
    label:      str        = "opacity"
    bbox:       List[float]            # [x, y, w, h] in 512×512 pixel space
    confidence: float      = Field(ge=0.0, le=1.0)
    area_px:    int

class Severity(BaseModel):
    """Graded severity output."""
    label:       str       # "Normal" | "Mild" | "Moderate" | "Severe"
    opacity_pct: float     = Field(ge=0.0, le=100.0)
    confidence:  float     = Field(ge=0.0, le=1.0)

class ImageOutputs(BaseModel):
    """Base64-encoded PNG image outputs."""
    annotated:  str        # original + drawn bboxes
    heatmap:    str        # Grad-CAM overlay only
    overlay:    str        # annotated + heatmap combined
    thumbnail:  str        # 256×256 preview

class RegionStat(BaseModel):
    """Per-region morphological statistics (Doctor Mode)."""
    region_id:       int
    centroid:        List[float]        # [x, y]
    eccentricity:    float
    area_px:         int
    mean_intensity:  float

class ModelInfo(BaseModel):
    name:      str
    version:   str
    threshold: float

class AdvancedMetrics(BaseModel):
    """Returned only when mode='doctor'."""
    map_score:    float
    iou_scores:   List[float]
    region_stats: List[RegionStat]
    model_info:   ModelInfo


# ─── Main analysis response ───────────────────────────────────────────────────

class AnalysisResponse(BaseModel):
    request_id:   str      = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp:    str      = Field(default_factory=lambda: datetime.datetime.utcnow().isoformat())
    status:       str                # "pneumonia_detected" | "normal" | "uncertain"
    severity:     Severity
    detections:   List[BoundingBox]
    images:       ImageOutputs
    advanced:     Optional[AdvancedMetrics] = None
    report_token: str


# ─── Feedback ────────────────────────────────────────────────────────────────

class FeedbackRequest(BaseModel):
    request_id:       str
    correct_label:    str                # "normal" | "pneumonia"
    reviewer_role:    str                # "radiologist" | "clinician" | "researcher"
    comment:          Optional[str]      = None
    corrected_bboxes: Optional[List[List[float]]] = None

class FeedbackResponse(BaseModel):
    accepted: bool
    message:  str


# ─── Health ───────────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status:        str         # "ok" | "degraded"
    model_loaded:  bool
    gpu_available: bool
    version:       str
