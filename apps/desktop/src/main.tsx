import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { K8sIdeApp } from '@k8s-ide/app';
import { invoke } from '@tauri-apps/api/core';
import './styles.css';

function DesktopBootstrap(): React.ReactElement {
  useEffect(() => {
    void invoke<string>('start_backend').catch((error) => {
      console.error('Failed to start backend sidecar', error);
    });

    return () => {
      void invoke<string>('stop_backend').catch((error) => {
        console.error('Failed to stop backend sidecar', error);
      });
    };
  }, []);

  return <K8sIdeApp platform="desktop" />;
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <DesktopBootstrap />
  </React.StrictMode>
);
