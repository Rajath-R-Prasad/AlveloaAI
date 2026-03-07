import { useState } from "react";
import { getGeminiGuidance } from "../utils/api";

export default function GeminiCard({ severity, patientAge, patientNotes }) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleGenerate = async () => {
    if (!apiKey.trim()) { setError("Please enter your Gemini API key."); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const text = await getGeminiGuidance({
        severity, age: patientAge, notes: patientNotes, apiKey,
      });
      setResult(text);
    } catch (e) {
      setError(e.message || "Gemini API error. Check your key and network.");
    }
    setLoading(false);
  };

  const renderResult = (text) =>
    text.split("\n").map((line, i) => {
      if (line.startsWith("**") && line.endsWith("**"))
        return <p key={i} className="font-bold text-sage mt-4 mb-1 text-base">{line.replace(/\*\*/g, "")}</p>;
      if (line.trim().startsWith("-"))
        return (
          <p key={i} className="pl-4 text-muted text-sm mb-1">
            <span className="text-coral mr-2">·</span>
            {line.replace(/^-\s*/, "")}
          </p>
        );
      return line.trim()
        ? <p key={i} className="text-sm text-text mb-1">{line}</p>
        : <div key={i} className="h-2" />;
    });

  return (
    <div className="rounded-2xl overflow-hidden border border-sage/30 bg-gradient-to-br from-sage/8 to-sage/3">
      {/* Header */}
      <div className="px-6 py-4 border-b border-sage/20 flex items-center gap-3">
        <span className="text-2xl">💊</span>
        <div>
          <p className="font-serif text-lg font-bold text-sage">Treatment Guidance</p>
          <p className="text-xs text-muted">{severity}</p>
        </div>
      </div>

      <div className="p-6">
        {!result && !loading && (
          <>
            <p className="text-sm text-muted mb-4 leading-relaxed">
              Generate caregiver-friendly care instructions based on the detected severity.
              Covers home care steps, warning signs, and monitoring tips.
            </p>

            <div className="flex gap-3 mb-3">
              <button
                onClick={handleGenerate}
                disabled={!apiKey.trim() || loading}
                className="btn-coral px-6 py-3 text-sm rounded-xl"
              >
                Get Guidance
              </button>
            </div>

            {!apiKey && (
              <p className="text-xs text-coral mt-2">
                ⚠️ Missing VITE_GEMINI_API_KEY in .env file. Please restart the front-end server.
              </p>
            )}

            {error && (
              <div className="mt-3 p-3 rounded-lg bg-coral/10 border border-coral/30 text-coral text-sm">
                {error}
              </div>
            )}
          </>
        )}

        {loading && (
          <div className="text-center py-8">
            <div className="w-10 h-10 rounded-full border-2 border-border border-t-sage animate-spinSlow mx-auto mb-4" />
            <p className="text-muted text-sm">Get recommendation on quick care</p>
          </div>
        )}

        {result && (
          <div className="animate-fadeIn">
            {renderResult(result)}
            <div className="mt-5 p-3 rounded-lg bg-coral/8 border border-coral/20 text-xs text-coral">
              ⚕ AI-generated guidance only. Always consult a qualified physician before treatment decisions.
            </div>
            <button className="btn-ghost mt-3 text-xs"
              onClick={() => { setResult(null); setError(null); }}>
              Regenerate
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
