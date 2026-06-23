import React, { useEffect, useMemo, useState, type ReactElement } from 'react';
import ReactDOM from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import { HttpK8sApiClient } from '@k8s-ide/api-client';
import { K8sIdeApp } from '@k8s-ide/app';
import '../../web/src/styles.css';

function DesktopRoot(): ReactElement {
  const [baseUrl, setBaseUrl] = useState('http://127.0.0.1:43210');
  const client = useMemo(() => new HttpK8sApiClient({ baseUrl }), [baseUrl]);

  useEffect(() => {
    const start = async (): Promise<void> => {
      try {
        const result = await invoke<{ port: number }>('start_backend', { preferredPort: 43210 });
        setBaseUrl(`http://127.0.0.1:${result.port}`);
      } catch {
        setBaseUrl('http://127.0.0.1:43210');
      }
    };

    void start();

    return () => {
      void invoke('stop_backend').catch(() => undefined);
    };
  }, []);

  return <K8sIdeApp client={client} platform="desktop" />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DesktopRoot />
  </React.StrictMode>
);
