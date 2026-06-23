import { K8sIdeApp } from '@k8s-ide/app';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Missing root element');
}

createRoot(rootElement).render(
  <StrictMode>
    <K8sIdeApp platform="desktop" apiBaseUrl={import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8741/api'} wsBaseUrl={import.meta.env.VITE_WS_BASE_URL || 'ws://127.0.0.1:8741/ws'} />
  </StrictMode>
);
