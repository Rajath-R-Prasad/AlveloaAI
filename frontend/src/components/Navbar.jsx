import { Link, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { healthCheck } from "../utils/api";

export default function Navbar() {
  const [modelOnline, setModelOnline] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    healthCheck()
      .then((d) => setModelOnline(d.model_loaded))
      .catch(() => setModelOnline(false));
  }, []);

  const scrollTo = (id) => {
    if (location.pathname !== "/") {
      navigate("/");
      setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }), 120);
    } else {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center justify-between
                    px-12 bg-bg/90 backdrop-blur-2xl border-b border-border">
      {/* Logo */}
      <Link to="/" className="flex items-center gap-2.5 no-underline">
        <div className="w-8 h-8 rounded-full bg-coral flex items-center justify-center
                        text-base animate-halo">🫁</div>
        <span className="font-serif text-lg font-bold text-cream">AlveolaAI</span>
      </Link>

      {/* Links */}
      <div className="flex items-center gap-8">
        {[
          ["Why It Matters", "why"],
          ["Symptoms", "symptoms"],
          ["How It Works", "how"],
          ["FAQ", "faq"],
        ].map(([label, id]) => (
          <button key={id} onClick={() => scrollTo(id)}
            className="text-sm text-muted transition-colors hover:text-coral bg-transparent border-none cursor-pointer">
            {label}
          </button>
        ))}
        <Link to="/analyze" className="btn-coral text-sm py-2.5 px-6 no-underline">
          Analyse X-ray →
        </Link>
      </div>

      {/* Model status */}
      <div className="flex items-center gap-2 text-xs text-muted">
        <span className={`w-2 h-2 rounded-full ${modelOnline === null ? "bg-amber-400 animate-pulse" :
            modelOnline ? "bg-sage animate-halo" : "bg-coral"
          }`} />
        {modelOnline === null ? "CONNECTING…" : modelOnline ? "MODEL ONLINE" : "MODEL OFFLINE"}
      </div>
    </nav>
  );
}
