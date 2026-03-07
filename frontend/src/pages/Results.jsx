import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import XrayCanvas from "../components/XrayCanvas";
import GeminiCard from "../components/GeminiCard";
import FeedbackModal from "../components/FeedbackModal";
import { reportUrl } from "../utils/api";

const SEV = {
  Normal: { color: "text-sage", border: "border-sage/40", bg: "bg-sage/10", icon: "✓", label: "No pneumonia detected. Lung fields appear clear." },
  Mild: { color: "text-amber", border: "border-amber/40", bg: "bg-amber/10", icon: "⚠", label: "Mild opacity. Monitor closely. Follow-up within 48 h." },
  Moderate: { color: "text-orange-400", border: "border-orange-400/40", bg: "bg-orange-400/10", icon: "⚡", label: "Moderate consolidation. Clinical review required." },
  Severe: { color: "text-coral", border: "border-coral/40", bg: "bg-coral/10", icon: "🚨", label: "Severe opacity. Immediate intervention required." },
};

export default function Results() {
  const nav = useNavigate();
  const [result, setResult] = useState(null);
  const [patient, setPatient] = useState({});
  const [mode, setMode] = useState("quick");
  const [showBbox, setBbox] = useState(true);
  const [showHeat, setHeat] = useState(false);
  const [showFb, setFb] = useState(false);

  useEffect(() => {
    const r = sessionStorage.getItem("alveolaai_result");
    const p = sessionStorage.getItem("alveolaai_patient");
    const m = sessionStorage.getItem("alveolaai_mode");
    if (!r) { nav("/analyze"); return; }
    setResult(JSON.parse(r));
    setPatient(p ? JSON.parse(p) : {});
    setMode(m || "quick");
  }, [nav]);

  if (!result) return null;
  const sev = SEV[result.severity.label] || SEV.Normal;

  return (
    <div className="pt-16 min-h-screen">
      {showFb && (
        <FeedbackModal requestId={result.request_id} onClose={() => setFb(false)} />
      )}

      <section className="px-16 py-12 max-w-[1200px] mx-auto pb-20">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
          <div>
            <p className="text-xs text-coral font-bold uppercase tracking-widest mb-1">
              — Analysis Complete · {result.request_id}
            </p>
            <h2 className="font-serif text-[clamp(24px,3vw,40px)] font-bold text-cream">
              {patient.name || "Patient"}&apos;s Chest Radiograph Report
            </h2>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <span className={`px-4 py-1.5 rounded-full text-xs font-bold border ${sev.color} ${sev.bg} ${sev.border}`}>
              {sev.icon} {result.severity.label}
            </span>
            <button className="btn-ghost text-xs" onClick={() => setFb(true)}>✏ Correct</button>
            <button className="btn-ghost text-xs"
              onClick={() => { sessionStorage.removeItem("alveolaai_result"); nav("/analyze"); }}>
              + New Scan
            </button>
          </div>
        </div>

        {/* Alert banner */}
        {/* <div className={`flex items-center gap-4 p-4 rounded-xl border mb-6 ${sev.bg} ${sev.border}`}>
          <span className="text-2xl">{sev.icon}</span>
          <div>
            <p className={`font-bold text-sm mb-0.5 ${sev.color}`}>{result.severity.label}</p>
            <p className="text-xs text-muted">{sev.label}</p>
          </div>
        </div> */}

        {/* Main grid */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* X-ray viewer */}
          <div className="card overflow-hidden rounded-2xl">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h3 className="font-serif text-base font-bold text-cream">Annotated Radiograph</h3>
              <div className="flex gap-2">
                {[["Bounding Boxes", showBbox, setBbox, "coral"], ["Grad-CAM", showHeat, setHeat, "amber"]].map(([l, a, s, c]) => (
                  <button key={l} onClick={() => s(!a)}
                    className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-all
                      ${a ? `bg-${c}/15 border-${c} text-${c}` : "border-border text-muted"}`}>
                    {a ? "✓ " : ""}{l}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative bg-black" style={{ aspectRatio: "1 / 1" }}>
              <div className="absolute left-0 right-0 h-0.5 z-10 top-0 animate-scanY"
                style={{ background: "linear-gradient(90deg,transparent,#e8614a,transparent)" }} />
              <XrayCanvas
                detections={result.detections}
                showBbox={showBbox}
                showHeat={showHeat}
                annotatedB64={result.images?.annotated}
              />
            </div>
          </div>

          {/* Metrics column */}
          <div className="flex flex-col gap-4">
            {/* Severity */}
            <div className="card p-6 rounded-2xl">
              <p className="text-[10px] text-muted font-bold uppercase tracking-widest mb-4">Severity Assessment</p>
              <div className="flex items-baseline gap-3 mb-2">
                <span className={`font-serif text-5xl font-black ${sev.color}`}>{result.severity.label}</span>
                <span className="text-sm text-muted">{result.severity.opacity_pct}% lung opacity</span>
              </div>
              <p className="text-sm text-muted mb-4">Confidence: {Math.round(result.severity.confidence * 100)}%</p>
              <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-[1.4s] ease-out"
                  style={{
                    width: `${result.severity.opacity_pct}%`,
                    background: `linear-gradient(90deg,#4bbfa0,${result.severity.label === "Severe" ? "#e8614a" : result.severity.label === "Moderate" ? "#f07840" : "#f0a842"})`,
                  }}
                />
              </div>
              <div className="flex justify-between text-[9px] text-muted mt-1.5 uppercase tracking-wider">
                <span>0% Normal</span><span>15% Mild</span><span>40% Moderate</span><span>100% Severe</span>
              </div>
            </div>

            {/* Detections */}
            {result.detections.map((d, i) => (
              <div key={d.id} className="card p-5 rounded-2xl border-l-[3px] border-l-coral">
                <div className="flex justify-between items-center mb-2">
                  <div>
                    <p className="font-serif text-sm font-bold text-cream">Region {d.id} — {d.label}</p>
                    <p className="text-[10px] text-muted mt-0.5">
                      bbox [{d.bbox.join(", ")}] · {d.area_px?.toLocaleString()} px²
                    </p>
                  </div>
                  <span className="font-serif text-3xl font-black text-coral">
                    {Math.round(d.confidence * 100)}%
                  </span>
                </div>
                <div className="w-full h-1 bg-border rounded-full overflow-hidden">
                  <div className="h-full bg-coral rounded-full transition-all duration-[1.2s]"
                    style={{ width: `${d.confidence * 100}%` }} />
                </div>
              </div>
            ))}

            {/* Quick summary */}
            <div className="card p-5 rounded-2xl">
              {[
                ["Overall Confidence", `${Math.round(result.severity.confidence * 100)}%`, "text-coral"],
                ["Regions Detected", result.detections.length, ""],
                ["Analysis Mode", mode === "doctor" ? "Doctor Mode" : "Quick Scan", ""],
                ["Status", result.status?.replace(/_/g, " "), ""],
              ].map(([l, v, c]) => (
                <div key={l} className="flex justify-between py-2.5 border-b border-border last:border-0">
                  <span className="text-xs text-muted font-semibold">{l}</span>
                  <span className={`text-sm font-bold ${c || "text-text"}`}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Doctor mode panel */}
        {mode === "doctor" && result.advanced && (
          <div className="card p-7 rounded-2xl mb-6 border-sage/30">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-2 h-2 rounded-full bg-sage animate-halo" />
              <h3 className="font-serif text-lg font-bold text-sage">Doctor Mode — Advanced Metrics</h3>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[
                ["mAP Score", result.advanced.map_score?.toFixed(3)],
                ["IoU Region 1", result.advanced.iou_scores?.[0]?.toFixed(3)],
                ["Model", result.advanced.model_info?.name],
                ["Version", result.advanced.model_info?.version],
                ["Threshold", result.advanced.model_info?.threshold],
                ["Regions", result.advanced.region_stats?.length],
              ].map(([k, v]) => (
                <div key={k} className="bg-surf border border-border rounded-xl p-4">
                  <p className="text-[10px] text-muted font-bold uppercase tracking-widest mb-1">{k}</p>
                  <p className="font-serif text-xl font-bold text-sage">{v ?? "—"}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Gemini treatment */}
        <div className="mb-6">
          <GeminiCard
            severity={result.severity.label}
            patientAge={patient.age}
            patientNotes={patient.notes}
          />
        </div>

        {/* PDF report */}
        <div className="p-6 rounded-2xl flex items-center justify-between flex-wrap gap-4"
          style={{ background: "linear-gradient(135deg,#1a2540,#141d2e)", border: "1px solid #253450" }}>
          <div>
            <p className="font-serif text-base font-bold text-cream mb-1">📄 Clinical PDF Report Ready</p>
            <p className="text-xs text-muted">
              Annotated radiograph · severity grade · confidence scores · bounding box data
              {mode === "doctor" ? " · mAP · IoU · region stats" : ""}
            </p>
          </div>
          <div className="flex gap-3">
            <a href={reportUrl(result.report_token)} target="_blank" rel="noreferrer"
              className="btn-coral text-sm py-3 px-6 no-underline">
              ↓ Download PDF
            </a>
            <button className="btn-ghost text-xs" onClick={() => setFb(true)}>✏ Correction</button>
          </div>
        </div>
      </section>
    </div>
  );
}
