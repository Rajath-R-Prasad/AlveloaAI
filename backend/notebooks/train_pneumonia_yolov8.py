"""
AlveolaAI — YOLOv8 Training Script
====================================
Trains a YOLOv8 object detection model on the RSNA Pneumonia Detection dataset.
The trained weights (.pt) are saved to ../models/ and exported to .pkl via
a thin sklearn-style wrapper for interoperability.

Usage:
    python train_pneumonia_yolov8.py --epochs 50 --imgsz 640 --batch 16

Requirements:
    pip install ultralytics torch torchvision scikit-learn matplotlib pickle5
"""

import argparse
import os
import pickle
import shutil
from pathlib import Path

import numpy as np
import torch
import matplotlib.pyplot as plt
from sklearn.metrics import classification_report, confusion_matrix
import seaborn as sns


# ── 0. Argument Parsing ──────────────────────────────────────────────────────
def get_args():
    p = argparse.ArgumentParser(description="Train YOLOv8 on RSNA pneumonia dataset")
    p.add_argument("--data",    type=str,   default="data.yaml", help="Path to YOLOv8 data config YAML")
    p.add_argument("--weights", type=str,   default="yolov8n.pt", help="Base YOLOv8 weights to fine-tune")
    p.add_argument("--epochs",  type=int,   default=50)
    p.add_argument("--imgsz",   type=int,   default=640)
    p.add_argument("--batch",   type=int,   default=16)
    p.add_argument("--device",  type=str,   default="0" if torch.cuda.is_available() else "cpu")
    p.add_argument("--project", type=str,   default="../models/runs")
    p.add_argument("--name",    type=str,   default="yolov8_pneumonia_v1")
    p.add_argument("--workers", type=int,   default=4)
    return p.parse_args()


# ── 1. data.yaml (auto-generate if missing) ──────────────────────────────────
DATA_YAML_CONTENT = """
path: ../data/rsna/processed
train: images/train
val:   images/val
test:  images/test

nc: 1
names: [opacity]

# Augmentation config (YOLOv8 hyperparams)
augment: true
hsv_h: 0.015
hsv_s: 0.7
hsv_v: 0.4
degrees: 10.0
translate: 0.1
scale: 0.5
shear: 0.0
perspective: 0.0
flipud: 0.0
fliplr: 0.5
mosaic: 1.0
mixup: 0.0
"""

def ensure_data_yaml(path: str):
    if not os.path.exists(path):
        with open(path, "w") as f:
            f.write(DATA_YAML_CONTENT.strip())
        print(f"[INFO] Created {path}")


# ── 2. Training ───────────────────────────────────────────────────────────────
def train(args):
    from ultralytics import YOLO

    print("\n" + "="*60)
    print(" AlveolaAI YOLOv8 Training")
    print("="*60)
    print(f"  Device : {args.device}")
    print(f"  Epochs : {args.epochs}")
    print(f"  ImgSz  : {args.imgsz}")
    print(f"  Batch  : {args.batch}")
    print("="*60 + "\n")

    ensure_data_yaml(args.data)

    model = YOLO(args.weights)

    results = model.train(
        data=args.data,
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=args.device,
        project=args.project,
        name=args.name,
        workers=args.workers,
        patience=10,          # early stopping
        save=True,
        save_period=5,
        val=True,
        plots=True,
        # Loss weights
        box=7.5,
        cls=0.5,
        dfl=1.5,
        # LR schedule
        lr0=0.01,
        lrf=0.01,
        momentum=0.937,
        weight_decay=0.0005,
        warmup_epochs=3,
    )

    return model, results


# ── 3. Evaluation ─────────────────────────────────────────────────────────────
def evaluate(model, args):
    print("\n[INFO] Running validation...")
    metrics = model.val(data=args.data, imgsz=args.imgsz, batch=args.batch, device=args.device)

    print("\n── Validation Metrics ─────────────────────")
    print(f"  mAP50        : {metrics.box.map50:.4f}")
    print(f"  mAP50-95     : {metrics.box.map:.4f}")
    print(f"  Precision    : {metrics.box.mp:.4f}")
    print(f"  Recall       : {metrics.box.mr:.4f}")
    print("───────────────────────────────────────────\n")
    return metrics


# ── 4. Export to ONNX + save .pkl wrapper ─────────────────────────────────────
def export_and_pickle(model, out_dir: str, run_name: str):
    os.makedirs(out_dir, exist_ok=True)

    # Save YOLOv8 .pt weights
    best_pt = Path(f"{out_dir}/runs/{run_name}/weights/best.pt")
    target_pt = Path(out_dir) / "yolov8_pneumonia.pt"
    if best_pt.exists():
        shutil.copy(best_pt, target_pt)
        print(f"[INFO] Weights saved → {target_pt}")

    # Export to ONNX (for edge deployment)
    try:
        model.export(format="onnx", imgsz=640)
        print("[INFO] ONNX model exported.")
    except Exception as e:
        print(f"[WARNING] ONNX export failed: {e}")

    # Save sklearn-compatible wrapper as .pkl
    wrapper = YOLOWrapper(str(target_pt) if target_pt.exists() else "yolov8n.pt")
    pkl_path = Path(out_dir) / "yolov8_pneumonia.pkl"
    with open(pkl_path, "wb") as f:
        pickle.dump(wrapper, f)
    print(f"[INFO] Sklearn wrapper pickled → {pkl_path}")

    # Save label encoder
    from sklearn.preprocessing import LabelEncoder
    le = LabelEncoder()
    le.fit(["Normal", "Mild", "Moderate", "Severe"])
    le_path = Path(out_dir) / "label_encoder.pkl"
    with open(le_path, "wb") as f:
        pickle.dump(le, f)
    print(f"[INFO] Label encoder saved → {le_path}")


# ── 5. sklearn-compatible wrapper ─────────────────────────────────────────────
class YOLOWrapper:
    """
    Thin sklearn-style wrapper around a YOLOv8 model.
    Allows pickling, loading, and calling .predict() in a familiar API.
    """
    def __init__(self, model_path: str):
        self.model_path = model_path
        self._model = None

    def _load(self):
        if self._model is None:
            from ultralytics import YOLO
            self._model = YOLO(self.model_path)

    def predict(self, X, conf: float = 0.45):
        """
        X: numpy array (H, W, 3) or list of arrays.
        Returns: list of dicts with keys [bbox, confidence].
        """
        self._load()
        if isinstance(X, np.ndarray) and X.ndim == 3:
            X = [X]
        results = []
        for img_arr in X:
            preds = self._model.predict(img_arr, conf=conf, verbose=False)
            dets  = []
            for box in preds[0].boxes:
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                dets.append({"bbox": [x1, y1, x2 - x1, y2 - y1],
                             "confidence": float(box.conf[0])})
            results.append(dets)
        return results

    def __getstate__(self):
        return {"model_path": self.model_path}

    def __setstate__(self, state):
        self.model_path = state["model_path"]
        self._model = None


# ── 6. Visualise training curves ──────────────────────────────────────────────
def plot_training_curves(run_dir: str):
    results_csv = Path(run_dir) / "results.csv"
    if not results_csv.exists():
        print("[WARNING] results.csv not found — skipping plots.")
        return

    import pandas as pd
    df = pd.read_csv(results_csv)
    df.columns = df.columns.str.strip()

    fig, axes = plt.subplots(2, 3, figsize=(15, 8))
    fig.suptitle("AlveolaAI YOLOv8 Training Curves", fontsize=14, fontweight="bold")

    pairs = [
        ("train/box_loss", "val/box_loss", "Box Loss"),
        ("train/cls_loss", "val/cls_loss", "Class Loss"),
        ("train/dfl_loss", "val/dfl_loss", "DFL Loss"),
        ("metrics/precision(B)", None,     "Precision"),
        ("metrics/recall(B)",    None,     "Recall"),
        ("metrics/mAP50(B)",     None,     "mAP@50"),
    ]

    for ax, (train_col, val_col, title) in zip(axes.flat, pairs):
        if train_col in df.columns:
            ax.plot(df[train_col], label="train", color="#e8614a")
        if val_col and val_col in df.columns:
            ax.plot(df[val_col], label="val", color="#4bbfa0")
        ax.set_title(title); ax.legend(); ax.grid(alpha=0.3)

    plt.tight_layout()
    out = Path(run_dir) / "training_curves.png"
    plt.savefig(out, dpi=150)
    print(f"[INFO] Training curves saved → {out}")
    plt.close()


# ── 7. PyTorch metrics module (competition metric) ────────────────────────────
class PneumoniaCompetitionMetric(torch.nn.Module):
    """
    RSNA competition metric: mean IoU @ thresholds [0.4, 0.45, ..., 0.75].
    Compatible with both PyTorch training loops and standalone evaluation.
    """
    def __init__(self, threshold: float = 0.5, iou_thresholds=None):
        super().__init__()
        self.threshold     = threshold
        self.iou_thresholds = iou_thresholds or [0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75]

    def forward(self, y_pred: torch.Tensor, y_true: torch.Tensor) -> torch.Tensor:
        pred_np = (y_pred.detach().cpu().numpy() > self.threshold).astype(np.uint8)
        true_np = y_true.detach().cpu().numpy().astype(np.uint8)
        scores  = [self._map_iou(p, t) for p, t in zip(pred_np, true_np)]
        return torch.tensor(np.mean(scores), dtype=torch.float32)

    @staticmethod
    def _iou_bbox(boxA, boxB):
        xA = max(boxA[0], boxB[0]); yA = max(boxA[1], boxB[1])
        xB = min(boxA[2], boxB[2]); yB = min(boxA[3], boxB[3])
        inter = max(0, xB - xA) * max(0, yB - yA)
        if inter == 0:
            return 0.0
        aA = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
        aB = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])
        return inter / float(aA + aB - inter)

    def _map_iou(self, pred_mask, true_mask):
        from skimage import measure
        pred_boxes = [r.bbox for r in measure.regionprops(measure.label(pred_mask))]
        true_boxes = [r.bbox for r in measure.regionprops(measure.label(true_mask))]

        if not pred_boxes and not true_boxes:
            return 1.0
        if not pred_boxes or not true_boxes:
            return 0.0

        scores = []
        for thr in self.iou_thresholds:
            tp = sum(
                1 for tb in true_boxes
                if any(self._iou_bbox(pb, tb) >= thr for pb in pred_boxes)
            )
            fp = len(pred_boxes) - tp
            fn = len(true_boxes) - tp
            denom = tp + 0.5 * (fp + fn)
            scores.append(tp / denom if denom > 0 else 0.0)
        return float(np.mean(scores))


# ── 8. Main ───────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    args = get_args()

    model, train_results = train(args)
    metrics = evaluate(model, args)

    run_dir = f"{args.project}/{args.name}"
    export_and_pickle(model, "../models", args.name)
    plot_training_curves(run_dir)

    print("\n✅ Training complete.")
    print(f"   mAP50    : {metrics.box.map50:.4f}")
    print(f"   mAP50-95 : {metrics.box.map:.4f}")
    print(f"   Weights  : ../models/yolov8_pneumonia.pt")
    print(f"   PKL      : ../models/yolov8_pneumonia.pkl")
