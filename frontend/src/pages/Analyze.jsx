import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import ConfirmModal from "../components/ConfirmModal";
import LoadingOverlay from "../components/LoadingOverlay";
import { analyzeXray } from "../utils/api";

export default function Analyze() {
  const nav = useNavigate();
  const fileRef = useRef(null);

  const [dragging, setDragging]     = useState(false);
  const [file, setFile]             = useState(null);
  const [preview, setPreview]       = useState(null);
  const [showConfirm, setConfirm]   = useState(false);
  const [loading, setLoading]       = useState(false);
  const [loadStep, setLoadStep]     = useState(0);
  const [error, setError]           = useState(null);
  const [mode, setMode]             = useState("quick");
  const [patient, setPatient]       = useState({ name: "", age: "", sex: "", notes: "" });

  const STEPS = 7;

  const handleFile = (f) => {
    if (!f || !f.type.startsWith("image/")) { setError("Please upload a valid image file (JPEG/PNG)."); return; }
    if (f.size > 10 * 1024 * 1024) { setError("File size must be under 10 MB."); return; }
    setFile(f); setPreview(URL.createObjectURL(f)); setError(null); setConfirm(true);
  };

  const handleAnalyze = async () => {
    setConfirm(false); setLoading(true); setLoadStep(0); setError(null);

    // Animate loading steps
    const stepInterval = setInterval(() => {
      setLoadStep((p) => { if (p < STEPS - 1) return p + 1; clearInterval(stepInterval); return p; });
    }, 600);

    try {
      const result = await analyzeXray({
        file,
        patientName: patient.name,
        patientAge:  patient.age ? parseInt(patient.age) : undefined,
        patientSex:  patient.sex || undefined,
        notes:       patient.notes || undefined,
        mode,
      });
      clearInterval(stepInterval);
      setLoadStep(STEPS);
      await new Promise((r) => setTimeout(r, 500));
      // Store result in sessionStorage for Results page
      sessionStorage.setItem("pneumoscan_result",  JSON.stringify(result));
      sessionStorage.setItem("pneumoscan_patient", JSON.stringify(patient));
      sessionStorage.setItem("pneumoscan_mode",    mode);
      nav("/results");
    } catch (e) {
      clearInterval(stepInterval);
      setLoading(false);
      setLoadStep(0);
      setError(e.response?.data?.detail || e.message || "Analysis failed. Please try again.");
    }
  };

  const upd = (k) => (e) => setPatient((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="pt-16 min-h-screen">
      {loading && <LoadingOverlay step={loadStep} />}
      {showConfirm && preview && (
        <ConfirmModal
          preview={preview}
          onConfirm={handleAnalyze}
          onRetake={() => { setConfirm(false); setFile(null); setPreview(null); }}
        />
      )}

      <section className="px-16 py-16 max-w-5xl mx-auto">
        <p className="text-xs font-bold text-coral uppercase tracking-widest mb-2">— Upload</p>
        <h2 className="font-serif text-[clamp(26px,4vw,48px)] font-bold text-cream mb-3">
          Chest Radiograph Analysis
        </h2>
        <p className="text-sm text-muted mb-12 leading-relaxed max-w-xl">
          JPEG · PNG · DICOM · Max 10 MB · Patient data is never stored server-side.
        </p>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-coral/10 border border-coral/30 text-coral text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-6">
          {/* ── Drop zone ── */}
          <div
            onDragEnter={() => setDragging(true)}
            onDragLeave={() => setDragging(false)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
            onClick={() => fileRef.current?.click()}
            className={`border-2 rounded-2xl p-12 text-center cursor-pointer transition-all duration-300
              flex flex-col items-center justify-center min-h-[380px]
              ${dragging ? "border-coral bg-coral/4 shadow-[inset_0_0_40px_rgba(232,97,74,.06)]"
                         : "border-dashed border-border bg-card hover:border-coral/40"}`}
          >
            <input ref={fileRef} type="file" accept="image/*,.dcm"
              className="hidden" onChange={(e) => handleFile(e.target.files[0])} />

            {preview ? (
              <>
                <img src={preview} alt="preview"
                  className="max-w-full max-h-[260px] object-contain rounded-xl mb-4" />
                <p className="text-sm text-coral font-semibold">✓ Click to replace</p>
              </>
            ) : (
              <>
                <div className="w-20 h-20 rounded-full bg-coral/10 border-2 border-dashed border-coral/30
                                flex items-center justify-center text-4xl mb-6">🩻</div>
                <h3 className="font-serif text-xl font-bold text-cream mb-2">Drop your X-ray here</h3>
                <p className="text-sm text-muted mb-6">or click to browse</p>
                <div className="flex gap-2">
                  {["JPEG", "PNG", "DICOM"].map((f) => (
                    <span key={f} className="px-3 py-1 border border-border rounded-full text-[11px] text-muted font-semibold">
                      {f}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ── Patient form ── */}
          <div className="card p-8 rounded-2xl">
            <h3 className="font-serif text-xl font-bold text-cream mb-1">Patient Information</h3>
            <p className="text-xs text-muted mb-6">All fields are optional</p>

            {/* Mode toggle */}
            <div className="flex border border-border rounded-xl overflow-hidden mb-6">
              {[["quick", "Quick Scan"], ["doctor", "Doctor Mode"]].map(([m, l]) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`flex-1 py-3 text-sm font-semibold border-none cursor-pointer transition-all
                    ${mode === m ? "bg-coral text-white" : "bg-transparent text-muted hover:text-text"}`}>
                  {l}
                </button>
              ))}
            </div>

            <div className="mb-4">
              <label className="block text-xs text-muted font-bold uppercase tracking-widest mb-2">
                Patient Name / ID
              </label>
              <input className="input-field" placeholder="Anonymous" value={patient.name} onChange={upd("name")} />
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs text-muted font-bold uppercase tracking-widest mb-2">Age</label>
                <input className="input-field" type="number" placeholder="—"
                  value={patient.age} onChange={upd("age")} />
              </div>
              <div>
                <label className="block text-xs text-muted font-bold uppercase tracking-widest mb-2">Sex</label>
                <select className="input-field" value={patient.sex} onChange={upd("sex")}>
                  <option value="">—</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                  <option value="O">Other</option>
                </select>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-xs text-muted font-bold uppercase tracking-widest mb-2">
                Clinical Notes
              </label>
              <textarea className="input-field min-h-[80px]"
                placeholder="Symptoms, history, or relevant context…"
                value={patient.notes} onChange={upd("notes")} />
            </div>

            {mode === "doctor" && (
              <div className="p-3 rounded-xl bg-sage/6 border border-sage/20 text-sage text-sm mb-4">
                ✓ Doctor Mode returns mAP scores, IoU, intensity statistics, model metadata.
              </div>
            )}

            <button className="btn-coral w-full justify-center text-base py-4"
              disabled={!file} onClick={() => setConfirm(true)}>
              Analyse Radiograph →
            </button>
            {!file && (
              <p className="text-center text-xs text-muted mt-3">Upload a chest X-ray to continue</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
