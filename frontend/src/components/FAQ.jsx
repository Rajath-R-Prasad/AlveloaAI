import { useState } from "react";

const FAQS = [
  {
    q: "How is pneumonia different from a regular cold or flu?",
    a: "Colds and flu primarily affect the upper respiratory tract. Pneumonia infects the lung tissue itself — alveoli fill with fluid and pus, directly impairing oxygen exchange. This is significantly more dangerous, especially in children under 5.",
  },
  {
    q: "Can the AI replace my doctor's diagnosis?",
    a: "No. AlveolaAI is a clinical decision-support tool — a second reader. It helps radiologists and clinicians catch subtle opacities faster and more consistently. All results require review by a qualified healthcare professional before any treatment decision is made.",
  },
  {
    q: "What type of X-ray does the system need?",
    a: "Standard chest radiographs in PA (posterior-anterior) or AP (anterior-posterior) view. DICOM, JPEG, and PNG formats are accepted. The model was trained on the RSNA Pneumonia Detection dataset.",
  },
  {
    q: "How accurate is the AI detection?",
    a: "Comparable CNN-based models achieve 98–99% classification accuracy on RSNA benchmarks. Our YOLOv8-based detector adds bounding box localisation, which classification-only models lack. Real-world accuracy depends on image quality and patient demographics.",
  },
  {
    q: "Is patient data stored on your servers?",
    a: "No. Images and metadata are processed in memory and immediately discarded after analysis. The only persistent data is an anonymised result token for PDF retrieval, which expires in 24 hours.",
  },
  {
    q: "Why is early detection specifically important for children?",
    a: "Children's lung and immune systems are still maturing. Pneumonia progresses faster in young children — from mild symptoms to respiratory failure in hours. Faint ground-glass opacities visible on X-ray often precede clinical deterioration by 6–12 hours.",
  },
];

export default function FAQ() {
  const [open, setOpen] = useState(null);
  return (
    <div className="flex flex-col gap-3">
      {FAQS.map((f, i) => (
        <div
          key={i}
          className={`rounded-xl overflow-hidden border transition-colors duration-200
            ${open === i ? "border-coral/40 bg-coral/4" : "border-border bg-card"}`}
        >
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full px-6 py-5 flex items-center justify-between
                       bg-transparent text-left cursor-pointer"
          >
            <span className="text-sm font-semibold text-text pr-4">{f.q}</span>
            <span
              className="text-coral text-xl flex-shrink-0 transition-transform duration-300"
              style={{ transform: open === i ? "rotate(45deg)" : "rotate(0)" }}
            >
              +
            </span>
          </button>
          {open === i && (
            <p className="px-6 pb-5 text-sm text-muted leading-relaxed animate-fadeIn">
              {f.a}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
