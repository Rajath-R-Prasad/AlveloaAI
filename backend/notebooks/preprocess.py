"""
Preprocessing pipeline:
  1. Convert RSNA DICOM → JPEG 1024×1024
  2. Convert CSV bounding box labels → YOLOv8 .txt format
  3. Split into train / val / test sets

Run: python preprocess.py --rsna_dir ../data/rsna --out_dir ../data/rsna/processed
"""
import os, csv, shutil, argparse, random
from pathlib import Path

import numpy as np
from PIL import Image

try:
    import pydicom
    DICOM_SUPPORT = True
except ImportError:
    DICOM_SUPPORT = False
    print("[WARNING] pydicom not installed. DICOM conversion will be skipped.")


# ── Args ─────────────────────────────────────────────────────────────────────
def get_args():
    p = argparse.ArgumentParser()
    p.add_argument("--rsna_dir",  default="../data/rsna")
    p.add_argument("--out_dir",   default="../data/rsna/processed")
    p.add_argument("--img_size",  type=int, default=1024)
    p.add_argument("--val_split", type=float, default=0.1)
    p.add_argument("--test_split",type=float, default=0.1)
    p.add_argument("--seed",      type=int, default=42)
    return p.parse_args()


# ── DICOM → JPEG ──────────────────────────────────────────────────────────────
def dicom_to_jpeg(dcm_path: str, out_path: str, size: int):
    if not DICOM_SUPPORT:
        return
    dcm = pydicom.dcmread(dcm_path)
    arr = dcm.pixel_array.astype(np.float32)
    arr = (arr - arr.min()) / (arr.max() - arr.min() + 1e-8) * 255
    img = Image.fromarray(arr.astype(np.uint8)).convert("RGB").resize((size, size))
    img.save(out_path, "JPEG", quality=95)


# ── RSNA CSV labels → YOLOv8 txt ────────────────────────────────────────────
def convert_labels(csv_path: str, img_size: int, out_label_dir: str):
    labels = {}  # patient_id → list of [cx, cy, w, h] normalised
    with open(csv_path) as f:
        reader = csv.DictReader(f)
        for row in reader:
            pid = row["patientId"]
            if row.get("Target", "0") == "0":
                labels.setdefault(pid, [])
                continue
            x, y, w, h = float(row["x"]), float(row["y"]), float(row["width"]), float(row["height"])
            orig_size   = 1024  # RSNA images are 1024×1024
            # Normalise for YOLOv8
            cx = (x + w / 2) / orig_size
            cy = (y + h / 2) / orig_size
            nw = w / orig_size
            nh = h / orig_size
            labels.setdefault(pid, []).append([0, cx, cy, nw, nh])  # class 0 = opacity

    os.makedirs(out_label_dir, exist_ok=True)
    for pid, boxes in labels.items():
        with open(os.path.join(out_label_dir, f"{pid}.txt"), "w") as f:
            for box in boxes:
                f.write(" ".join(map(str, box)) + "\n")
    print(f"[INFO] Labels written: {len(labels)} files → {out_label_dir}")
    return labels


# ── Train / Val / Test split ─────────────────────────────────────────────────
def make_splits(img_dir: str, splits_dir: str, val: float, test: float, seed: int):
    imgs = sorted(Path(img_dir).glob("*.jpg"))
    random.seed(seed)
    random.shuffle(imgs)
    n     = len(imgs)
    n_val = int(n * val)
    n_test= int(n * test)
    sets  = {
        "test":  imgs[:n_test],
        "val":   imgs[n_test:n_test + n_val],
        "train": imgs[n_test + n_val:],
    }
    os.makedirs(splits_dir, exist_ok=True)
    for name, paths in sets.items():
        with open(os.path.join(splits_dir, f"{name}.txt"), "w") as f:
            f.write("\n".join(str(p) for p in paths))
        print(f"[INFO] {name:5s}: {len(paths):,} images")


# ── Main ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    args  = get_args()
    dcm_dir = os.path.join(args.rsna_dir, "stage_2_train_images")
    csv_file= os.path.join(args.rsna_dir, "stage_2_train_labels.csv")

    img_out  = os.path.join(args.out_dir, "images", "train")
    lbl_out  = os.path.join(args.out_dir, "labels", "train")
    os.makedirs(img_out, exist_ok=True)

    # Convert DICOMs
    if DICOM_SUPPORT and os.path.isdir(dcm_dir):
        dcm_files = list(Path(dcm_dir).glob("*.dcm"))
        print(f"[INFO] Converting {len(dcm_files):,} DICOM files…")
        for i, dcm in enumerate(dcm_files):
            out = os.path.join(img_out, dcm.stem + ".jpg")
            if not os.path.exists(out):
                dicom_to_jpeg(str(dcm), out, args.img_size)
            if (i + 1) % 500 == 0:
                print(f"  {i+1:,} / {len(dcm_files):,}")
        print("[INFO] DICOM conversion complete.")
    else:
        print("[WARNING] DICOM dir not found or pydicom missing. Skipping conversion.")

    # Convert labels
    if os.path.exists(csv_file):
        convert_labels(csv_file, args.img_size, lbl_out)
    else:
        print(f"[WARNING] CSV not found: {csv_file}")

    # Make splits
    make_splits(img_out, os.path.join(args.out_dir, "splits"),
                args.val_split, args.test_split, args.seed)

    print("\n✅ Preprocessing complete.")
