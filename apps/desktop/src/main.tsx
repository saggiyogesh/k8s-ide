import React from 'react';
import ReactDOM from 'react-dom/client';
import { HttpK8sApiClient } from '@k8s-ide/api-client';
import { SharedApp } from '@k8s-ide/app';
import './styles.css';

const client = new HttpK8sApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:7447',
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <SharedApp client={client} platform="desktop" title="Kubernetes IDE - Desktop" />
  </React.StrictMode>,
);
