# backend/utils/inference.py  — COMPLETE FILE, replace everything

import torch
import torch.nn as nn
import segmentation_models_pytorch as smp
import numpy as np
from PIL import Image
import torchvision.transforms as T
from pathlib import Path

DEVICE       = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
MODEL_LOADED = False
model        = None
transform    = None
MODEL_CFG    = {}


class PneumoUNet(nn.Module):

    def __init__(self, encoder_name='mobilenet_v2', encoder_weights=None,
                 num_classes=2, dropout=0.3):
        super().__init__()

        self.unet = smp.UnetPlusPlus(
            encoder_name           = encoder_name,
            encoder_weights        = encoder_weights,
            in_channels            = 3,
            classes                = 1,
            activation             = None,
            decoder_attention_type = 'scse',
            decoder_channels       = (256, 128, 64, 32, 16),
        )

        bottleneck_ch = self.unet.encoder.out_channels[-1]

        self.cls_head = nn.Sequential(
            nn.AdaptiveAvgPool2d(1),
            nn.Flatten(),
            nn.Dropout(p=dropout),
            nn.Linear(bottleneck_ch, 256),
            nn.BatchNorm1d(256),
            nn.SiLU(),
            nn.Dropout(p=dropout / 2),
            nn.Linear(256, num_classes),
        )

        self.sigmoid = nn.Sigmoid()

    def forward(self, x):
        features    = self.unet.encoder(x)
        bottleneck  = features[-1]
        decoder_out = self.unet.decoder(features)        # UnetPlusPlus takes list
        seg_logits  = self.unet.segmentation_head(decoder_out)
        seg_mask    = self.sigmoid(seg_logits)
        cls_logits  = self.cls_head(bottleneck)
        return seg_mask, cls_logits


def detect_encoder_from_weights(state_dict):
    first_key = next(iter(state_dict.keys()))
    if 'encoder.features.' in first_key:
        return 'mobilenet_v2'
    elif 'encoder._conv_stem' in first_key or 'encoder._blocks' in first_key:
        return 'efficientnet-b2'
    elif 'encoder.layer1' in first_key:
        return 'resnet34'
    else:
        print(f"[WARN] Unknown encoder pattern in key: {first_key}")
        return 'mobilenet_v2'


def load_model(model_path='models/best_model.pt'):
    global model, transform, MODEL_LOADED, MODEL_CFG

    ckpt_path = Path(model_path)
    if not ckpt_path.exists():
        raise FileNotFoundError(f"Weights not found: {ckpt_path.resolve()}")

    ckpt = torch.load(ckpt_path, map_location=DEVICE)

    if isinstance(ckpt, dict) and 'model_state' in ckpt:
        state_dict = ckpt['model_state']
        MODEL_CFG  = ckpt.get('cfg', {})
        print(f"[INFO] Epoch {ckpt.get('epoch','?')} | Val F1: {ckpt.get('val_f1', 0.0):.4f}")
    else:
        state_dict = ckpt
        MODEL_CFG  = {}

    encoder_from_cfg     = MODEL_CFG.get('encoder', 'unknown')
    encoder_from_weights = detect_encoder_from_weights(state_dict)

    if encoder_from_cfg != encoder_from_weights:
        print(f"[WARN] CFG says '{encoder_from_cfg}' but weights are '{encoder_from_weights}'")

    encoder  = encoder_from_weights
    dropout  = MODEL_CFG.get('dropout',  0.3)
    img_size = MODEL_CFG.get('img_size', 256)

    try:
        params   = smp.encoders.get_preprocessing_params(encoder, 'imagenet')
        img_mean = list(params['mean'])
        img_std  = list(params['std'])
    except Exception:
        img_mean = [0.485, 0.456, 0.406]
        img_std  = [0.229, 0.224, 0.225]

    img_mean = MODEL_CFG.get('img_mean', img_mean)
    img_std  = MODEL_CFG.get('img_std',  img_std)

    model = PneumoUNet(
        encoder_name    = encoder,
        encoder_weights = None,
        num_classes     = 2,
        dropout         = dropout,
    ).to(DEVICE)

    model.load_state_dict(state_dict, strict=True)
    model.eval()

    transform = T.Compose([
        T.Resize((img_size, img_size)),
        T.ToTensor(),
        T.Normalize(mean=img_mean, std=img_std),
    ])

    MODEL_LOADED = True
    print(f"[INFO] Model ready - encoder={encoder} img_size={img_size} device={DEVICE}")


def run_inference(pil_image, threshold=0.5):
    if not MODEL_LOADED:
        raise RuntimeError("Model not loaded. Call load_model() first.")

    x = transform(pil_image.convert('RGB')).unsqueeze(0).to(DEVICE)

    with torch.no_grad():
        seg_mask, cls_logits = model(x)

    probs         = torch.softmax(cls_logits, dim=1)[0].cpu()
    predicted_idx = probs.argmax().item()

    binary_mask = (seg_mask[0, 0] > threshold).float().cpu()
    opacity_pct = binary_mask.mean().item() * 100

    if predicted_idx == 0:
        severity = 'Normal'
    elif opacity_pct <= 15:
        severity = 'Mild'
    elif opacity_pct <= 40:
        severity = 'Moderate'
    else:
        severity = 'Severe'

    return {
        'class_scores': {
            'Normal':    round(probs[0].item() * 100, 2),
            'Pneumonia': round(probs[1].item() * 100, 2),
        },
        'predicted_class': ['Normal', 'Pneumonia'][predicted_idx],
        'confidence':      round(probs[predicted_idx].item() * 100, 2),
        'severity':        severity,
        'opacity_pct':     round(opacity_pct, 2),
        'seg_mask':        seg_mask[0, 0].cpu().numpy(),
        'binary_mask':     binary_mask.numpy(),
    }


def compute_severity(opacity_pct, predicted_class):
    if predicted_class == 'Normal': return 'Normal'
    if opacity_pct <= 15:           return 'Mild'
    if opacity_pct <= 40:           return 'Moderate'
    return 'Severe'


def is_model_loaded():
    return MODEL_LOADED