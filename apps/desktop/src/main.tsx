import ReactDOM from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import { K8sIdeApp } from '@k8s-ide/app';
import './index.css';

async function resolveBackendUrl() {
  try {
    return await invoke<string>('get_backend_url');
  } catch {
    return import.meta.env.VITE_BACKEND_URL ?? 'http://127.0.0.1:3010';
  }
}

void resolveBackendUrl().then((backendUrl) => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <K8sIdeApp backendUrl={backendUrl} platform="desktop" />,
  );
});
