import React from 'react';
import ReactDOM from 'react-dom/client';

import { K8sIdeApp } from '@k8s-ide/app';

import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <K8sIdeApp platform="web" defaultApiBaseUrl="/api" />
  </React.StrictMode>,
);
