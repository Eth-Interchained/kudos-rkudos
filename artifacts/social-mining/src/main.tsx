import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerAdminAuth } from "@/lib/adminAuth";

registerAdminAuth();

createRoot(document.getElementById("root")!).render(<App />);
