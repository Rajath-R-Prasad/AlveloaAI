"""POST /api/feedback — radiologist correction submission."""
from fastapi import APIRouter
from schemas.models import FeedbackRequest, FeedbackResponse
import datetime, json, os

router = APIRouter()
FEEDBACK_LOG = os.getenv("FEEDBACK_LOG", "/tmp/feedback_log.jsonl")


@router.post("/feedback", response_model=FeedbackResponse)
async def submit_feedback(body: FeedbackRequest):
    entry = {
        "timestamp":       datetime.datetime.utcnow().isoformat(),
        "request_id":      body.request_id,
        "correct_label":   body.correct_label,
        "reviewer_role":   body.reviewer_role,
        "comment":         body.comment,
        "corrected_bboxes": body.corrected_bboxes,
    }
    try:
        with open(FEEDBACK_LOG, "a") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception as e:
        return FeedbackResponse(accepted=False, message=f"Storage error: {e}")

    return FeedbackResponse(accepted=True, message="Feedback recorded. Thank you.")
