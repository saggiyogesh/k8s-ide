import React from 'react';
import ReactDOM from 'react-dom/client';
import { HttpK8sApiClient } from '@k8s-ide/api-client';
import { K8sIdeApp } from '@k8s-ide/app';
import './styles.css';

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const apiBaseUrl =
  typeof configuredApiBaseUrl === 'string' && configuredApiBaseUrl.length > 0
    ? configuredApiBaseUrl
    : 'http://127.0.0.1:43210';
const client = new HttpK8sApiClient({ baseUrl: apiBaseUrl });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <K8sIdeApp client={client} platform="web" />
  </React.StrictMode>
);
