import ReactDOM from 'react-dom/client';
import { K8sIdeApp } from '@k8s-ide/app';
import './index.css';

const backendUrl = import.meta.env.VITE_BACKEND_URL ?? 'http://127.0.0.1:3010';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <K8sIdeApp backendUrl={backendUrl} platform="web" />,
);
