import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { K8sIdeApp } from '@k8s-ide/app';
import './styles.css';

const apiBaseUrl = import.meta.env.VITE_K8S_IDE_API_BASE_URL ?? 'http://127.0.0.1:7447';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <K8sIdeApp apiBaseUrl={apiBaseUrl} platform="web" />
  </StrictMode>,
);
