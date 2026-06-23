import '@k8s-ide/ui/styles.css'
import { K8sIdeApp } from '@k8s-ide/app'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

const backendUrl = import.meta.env.VITE_BACKEND_URL ?? ''

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <K8sIdeApp backendUrl={backendUrl || undefined} />
  </StrictMode>,
)
