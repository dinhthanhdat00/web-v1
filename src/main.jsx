import { createRoot } from "react-dom/client";
import * as LightweightCharts from "lightweight-charts";
import App from "./App.jsx";
import "../assets/css/styles.css";

// The existing chart engine uses the v4 namespace. Keep it available while
// React gradually takes ownership of individual dashboard features.
window.LightweightCharts = LightweightCharts;

createRoot(document.getElementById("root")).render(<App />);
