import "./index.css"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { AppShell } from "@k8s-ide/app"

// The desktop app always talks to the local sidecar backend on port 7080.
const BACKEND_URL = "http://127.0.0.1:7080"

const root = document.getElementById("root")
if (!root) throw new Error("Root element not found")

createRoot(root).render(
  <StrictMode>
    <AppShell backendUrl={BACKEND_URL} />
  </StrictMode>,
)
