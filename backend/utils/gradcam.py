"""
Grad-CAM heatmap generation utilities.
Uses pytorch-grad-cam library on the backbone feature extractor.
Falls back to a synthetic heatmap in demo mode.
"""
import numpy as np
from PIL import Image


def generate_gradcam(img: Image.Image, detections: list[dict]) -> Image.Image:
    """
    Returns a PIL Image (RGB) of the Grad-CAM heatmap overlay.
    In production: use pytorch_grad_cam on the YOLOv8 backbone.
    """
    if not detections:
        return img.copy()

    # ── Synthetic heatmap (demo mode) ──────────────────────────
    arr = np.zeros((img.height, img.width), dtype=np.float32)

    for d in detections:
        x, y, w, h = [int(v) for v in d["bbox"]]
        cx, cy     = x + w // 2, y + h // 2
        conf       = d["confidence"]

        # Gaussian blob centred on detection
        for row in range(max(0, y - h), min(img.height, y + 2 * h)):
            for col in range(max(0, x - w), min(img.width, x + 2 * w)):
                dist = ((col - cx) ** 2 / (w ** 2) + (row - cy) ** 2 / (h ** 2))
                arr[row, col] += conf * np.exp(-dist)

    # Normalise → colour map (orange-red)
    if arr.max() > 0:
        arr /= arr.max()

    rgb = np.zeros((*arr.shape, 3), dtype=np.uint8)
    rgb[..., 0] = (arr * 255).astype(np.uint8)           # R
    rgb[..., 1] = ((1 - arr) * arr * 180).astype(np.uint8) # G
    rgb[..., 2] = 0                                        # B

    heat   = Image.fromarray(rgb, "RGB")
    blended = Image.blend(img.convert("RGB"), heat, alpha=0.45)
    return blended


# ── Production hook ─────────────────────────────────────────────────────────
# from pytorch_grad_cam import GradCAM
# from pytorch_grad_cam.utils.image import show_cam_on_image
# def generate_gradcam_real(model, img_tensor, target_layers):
#     with GradCAM(model=model, target_layers=target_layers) as cam:
#         grayscale = cam(input_tensor=img_tensor)
#         visualization = show_cam_on_image(img_np, grayscale[0], use_rgb=True)
#     return Image.fromarray(visualization)
