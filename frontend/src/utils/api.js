import axios from "axios";

const BASE = import.meta.env.VITE_API_BASE_URL || "";

const api = axios.create({ baseURL: BASE, timeout: 60000 });

// ── Analyse a chest X-ray ───────────────────────────────────────────────────
export async function analyzeXray({ file, patientName, patientAge, patientSex, notes, mode }) {
  const form = new FormData();
  form.append("file", file);
  if (patientName) form.append("patient_name", patientName);
  if (patientAge) form.append("patient_age", patientAge);
  if (patientSex) form.append("patient_sex", patientSex);
  if (notes) form.append("notes", notes);
  form.append("mode", mode || "quick");

  const { data } = await api.post("/api/analyze", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

// ── Download PDF report ─────────────────────────────────────────────────────
export function reportUrl(token) {
  return `${BASE}/api/report/${token}`;
}

// ── Submit radiologist feedback ─────────────────────────────────────────────
export async function submitFeedback(payload) {
  const { data } = await api.post("/api/feedback", payload);
  return data;
}

// ── Health check ────────────────────────────────────────────────────────────
export async function healthCheck() {
  const { data } = await api.get("/api/health");
  return data;
}

// ── Gemini treatment guidance ───────────────────────────────────────────────
export async function getGeminiGuidance({ severity, age, notes, apiKey }) {
  try {
    const prompt = `You are a medical AI assistant helping clinicians communicate with caregivers.

A patient${age ? ` aged ${age}` : ""} has been diagnosed with ${severity} pneumonia via chest X-ray AI analysis.
${notes ? `Clinical notes: ${notes}` : ""}

Provide a structured response with:

1. **Immediate Care Steps** – What caregivers should do now
2. **Warning Signs to Watch** – Symptoms requiring emergency care
3. **Home Monitoring Tips** – Checking breathing rate, fever, feeding
4. **Dietary & Hydration** – Practical guidance

Keep language simple enough for a non-medical caregiver.
End with a clear disclaimer that this is not a medical diagnosis.`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 700
          }
        })
      }
    );

    const json = await res.json();

    // Handle API errors
    if (json.error) {
      // Quota exceeded
      if (
        json.error.code === 429 ||
        json.error.status === "RESOURCE_EXHAUSTED" ||
        json.error.message?.includes("quota")
      ) {
        console.warn("Gemini API quota exceeded. Falling back to local guidance template.");
        throw new Error("QUOTA_EXCEEDED");
      }

      throw new Error(json.error.message);
    }

    return json.candidates?.[0]?.content?.parts?.[0]?.text || "No guidance generated.";

  } catch (err) {
    console.error("Gemini guidance error:", err);

    // Fallback guidance if Gemini fails
    return `**Immediate Care Steps:**
• Ensure the patient stays hydrated
• Allow adequate rest
• Use fever medication if prescribed by a doctor

**Warning Signs to Watch:**
• Rapid or labored breathing
• Bluish lips or fingertips
• Persistent high fever
• Child or patient refusing fluids or food

**Home Monitoring Tips:**
• Check breathing rate regularly
• Monitor body temperature
• Observe energy level and feeding

**Dietary & Hydration:**
• Encourage fluids such as water, soups, or oral rehydration solutions
• Provide light, easy-to-digest meals

⚠️ **Disclaimer:**
This AI-generated guidance is for informational purposes only and is not a substitute for professional medical advice. Always consult a qualified healthcare provider.`;
  }
}
