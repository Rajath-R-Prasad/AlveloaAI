import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import Analyze from "./pages/Analyze";
import Results from "./pages/Results";

export default function App() {
  return (
    <div className="min-h-screen bg-bg text-text font-sans">
      <Navbar />
      <Routes>
        <Route path="/"        element={<Home />} />
        <Route path="/analyze" element={<Analyze />} />
        <Route path="/results" element={<Results />} />
      </Routes>
    </div>
  );
}
