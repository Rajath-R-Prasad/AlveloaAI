import { useRef, useEffect } from "react";

export default function XrayCanvas({ detections, showBbox, showHeat, annotatedB64 }) {
  const ref = useRef(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    const W = cv.width, H = cv.height;

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);

      // If the backend returned a base64 annotated image, draw it
      if (annotatedB64) {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, W, H);
          overlays();
        };
        img.src = `data:image/png;base64,${annotatedB64}`;
        return;
      }

      // Fallback: draw synthetic lung illustration
      const lung = (cx) => {
        const g = ctx.createRadialGradient(cx, H * 0.45, 8, cx, H * 0.5, W * 0.24);
        g.addColorStop(0, "rgba(195,195,195,.6)");
        g.addColorStop(0.55, "rgba(90,90,90,.4)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.beginPath();
        ctx.ellipse(cx, H * 0.5, W * 0.23, H * 0.35, 0, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      };
      lung(W * 0.33); lung(W * 0.67);

      // Ribs
      ctx.strokeStyle = "rgba(100,100,100,.18)"; ctx.lineWidth = 1;
      for (let i = 0; i < 9; i++) {
        const y = H * 0.26 + i * H * 0.057;
        ctx.beginPath(); ctx.moveTo(W * 0.15, y);
        ctx.bezierCurveTo(W * 0.28, y - 12, W * 0.38, y - 6, W * 0.5, y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(W * 0.85, y);
        ctx.bezierCurveTo(W * 0.72, y - 12, W * 0.62, y - 6, W * 0.5, y); ctx.stroke();
      }
      // Spine
      ctx.fillStyle = "rgba(140,140,140,.25)";
      ctx.fillRect(W * 0.478, H * 0.1, W * 0.044, H * 0.78);

      overlays();
    };

    const overlays = () => {
      if (showHeat && detections?.length) {
        detections.forEach((d) => {
          const [x, y, w, h] = d.bbox;
          const sx = (x / 512) * W, sy = (y / 512) * H;
          const sw = (w / 512) * W, sh = (h / 512) * H;
          const cx2 = sx + sw / 2, cy2 = sy + sh / 2;
          const r = Math.max(sw, sh) * 0.95;
          const hg = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, r);
          hg.addColorStop(0, `rgba(255,80,50,${d.confidence * 0.75})`);
          hg.addColorStop(0.5, `rgba(255,190,30,${d.confidence * 0.4})`);
          hg.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = hg;
          ctx.beginPath(); ctx.ellipse(cx2, cy2, r * 0.9, r * 0.75, 0, 0, Math.PI * 2); ctx.fill();
        });
      }

      if (showBbox && detections?.length) {
        detections.forEach((d, i) => {
          const [x, y, w, h] = d.bbox;
          const sx = (x / 512) * W, sy = (y / 512) * H;
          const sw = (w / 512) * W, sh = (h / 512) * H;
          ctx.shadowColor = "rgba(232,97,74,.7)"; ctx.shadowBlur = 8;
          ctx.strokeStyle = "#e8614a"; ctx.lineWidth = 1.8;
          ctx.setLineDash([6, 3]); ctx.strokeRect(sx, sy, sw, sh); ctx.setLineDash([]);
          ctx.shadowBlur = 0;
          const chip = `Region ${i + 1} · ${Math.round(d.confidence * 100)}%`;
          const cw = ctx.measureText(chip).width + 14;
          ctx.fillStyle = "#e8614a"; ctx.fillRect(sx, sy - 20, cw, 20);
          ctx.fillStyle = "#fff"; ctx.font = "bold 10px 'Nunito Sans',sans-serif";
          ctx.fillText(chip, sx + 7, sy - 6);
        });
      }

      // Crosshairs
      ctx.strokeStyle = "rgba(232,97,74,.25)"; ctx.lineWidth = 1;
      [[8, 8, 1, 1], [W - 8, 8, -1, 1], [8, H - 8, 1, -1], [W - 8, H - 8, -1, -1]].forEach(([cx, cy, dx, dy]) => {
        const l = 14;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + dx * l, cy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + dy * l); ctx.stroke();
      });
      ctx.fillStyle = "rgba(232,97,74,.3)";
      ctx.font = "9px 'Nunito Sans',sans-serif";
      ctx.fillText("ALVEOLAAI  CHEST AP", 10, H - 10);
    };

    draw();
  }, [detections, showBbox, showHeat, annotatedB64]);

  return (
    <canvas
      ref={ref}
      width={512}
      height={512}
      className="w-full h-full block"
    />
  );
}
