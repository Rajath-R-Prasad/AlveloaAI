"""POST /api/analyze — core inference endpoint."""
import io, uuid, base64, tempfile, os
import cv2
import numpy as np
from fastapi import APIRouter, File, Form, UploadFile, HTTPException
from fastapi.responses import FileResponse
from PIL import Image

from schemas.models import AnalysisResponse, Severity, BoundingBox, ImageOutputs, AdvancedMetrics, RegionStat, ModelInfo
from utils.inference import run_inference, compute_severity
from utils.gradcam import generate_gradcam
from utils.report import build_pdf

router = APIRouter()
MAX_MB = int(os.getenv("MAX_FILE_SIZE_MB", 10))


def _encode(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return base64.b64encode(buf.getvalue()).decode()

def extract_regions(binary_mask):
    mask = (binary_mask * 255).astype("uint8")
    contours, _ = cv2.findContours(
        mask,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE
    )
    regions = []
    for c in contours:
        x, y, w, h = cv2.boundingRect(c)
        regions.append({
            "bbox": [x, y, w, h],
            "area": int(w * h)
        })
    regions = sorted(regions, key=lambda r: r["area"], reverse=True)[:3]
    return regions

def draw_regions(image, regions):
    img = np.array(image).copy()
    for r in regions:
        x,y,w,h = r["bbox"]
        cv2.rectangle(
            img,
            (x,y),
            (x+w,y+h),
            (255,0,0),
            2
        )
    return Image.fromarray(img)


@router.post("/analyze", response_model=AnalysisResponse)
async def analyze(
    file:         UploadFile   = File(...),
    patient_name: str | None   = Form(None),
    patient_age:  int | None   = Form(None),
    patient_sex:  str | None   = Form(None),
    notes:        str | None   = Form(None),
    mode:         str          = Form("quick"),
):
    # ── Validate file ─────────────────────────────────────────────
    content = await file.read()
    if len(content) > MAX_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"File exceeds {MAX_MB} MB limit.")

    try:
        img = Image.open(io.BytesIO(content)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=422, detail="Cannot open image. Upload JPEG, PNG, or DICOM.")

    img_512 = img.resize((512, 512))

    # ── Run YOLOv8 inference ──────────────────────────────────────
    result = run_inference(img_512)

    regions = extract_regions(result["binary_mask"])

    severity_obj = Severity(
        label=result["severity"],
        confidence=result["confidence"]/100,
        opacity_pct=result["opacity_pct"]
    )

    detections = []
    for i, r in enumerate(regions):
        detections.append(BoundingBox(
            id=i+1,
            label="opacity",
            bbox=r["bbox"],
            confidence=result["confidence"]/100,
            area_px=r["area"]
        ))

    # ── Generate image outputs ────────────────────────────────────
    det_dicts = [d.model_dump() if hasattr(d, "model_dump") else d.dict() for d in detections]
    heatmap_img   = generate_gradcam(img_512, det_dicts)
    annotated_img = draw_regions(img_512, regions)
    overlay_img   = draw_regions(heatmap_img, regions)   # blend annotated + heatmap
    thumb         = img_512.resize((256, 256))

    images = ImageOutputs(
        annotated=_encode(annotated_img),
        heatmap=_encode(heatmap_img),
        overlay=_encode(overlay_img),
        thumbnail=_encode(thumb),
    )

    # ── Doctor mode extras ────────────────────────────────────────
    advanced = None
    if mode == "doctor":
        advanced = AdvancedMetrics(
            map_score=result["confidence"] / 100,
            iou_scores=[],
            region_stats=[],
            model_info=ModelInfo(name="YOLOv8-RSNA-v2", version="2.1.0", threshold=0.45),
        )

    # ── Build PDF report ──────────────────────────────────────────
    request_id   = str(uuid.uuid4())
    report_token = build_pdf(request_id, severity_obj, detections, images, patient_name, advanced)

    return AnalysisResponse(
        request_id=request_id,
        status="pneumonia_detected" if result["predicted_class"] == "Pneumonia" else "normal",
        severity=severity_obj,
        detections=detections,
        images=images,
        advanced=advanced,
        report_token=report_token,
    )


@router.get("/report/{token}")
async def download_report(token: str):
    path = f"/tmp/reports/{token}.pdf"
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Report not found or expired.")
    return FileResponse(path, media_type="application/pdf",
                        filename=f"alveolaai_{token[:8]}.pdf")
