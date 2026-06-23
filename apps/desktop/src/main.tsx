import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import { K8sIdeApp } from '@k8s-ide/app';

function DesktopBootstrap() {
  const [apiBaseUrl, setApiBaseUrl] = useState('http://127.0.0.1:7447');

  useEffect(() => {
    let disposed = false;

    async function startBackend() {
      try {
        const response = await invoke<string>('start_backend');
        if (!disposed && response) {
          setApiBaseUrl(response);
        }
      } catch (error) {
        console.error('Failed to start backend sidecar', error);
      }
    }

    void startBackend();

    return () => {
      disposed = true;
      void invoke('stop_backend').catch(() => undefined);
    };
  }, []);

  return <K8sIdeApp apiBaseUrl={apiBaseUrl} platform="desktop" />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DesktopBootstrap />
  </StrictMode>,
);
