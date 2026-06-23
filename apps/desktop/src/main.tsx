import '@k8s-ide/ui/styles.css'
import { K8sIdeApp } from '@k8s-ide/app'
import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'

const BACKEND_URL = 'http://127.0.0.1:9470'

function DesktopApp() {
  useEffect(() => {
    // Backend sidecar is started by the Tauri shell (src-tauri).
    // The dev workflow runs `pnpm --filter @k8s-ide/backend dev` separately.
    void fetch(`${BACKEND_URL}/health`).catch(() => {
      console.warn('Go backend not reachable at', BACKEND_URL)
    })
  }, [])

  return <K8sIdeApp backendUrl={BACKEND_URL} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DesktopApp />
  </StrictMode>,
)
