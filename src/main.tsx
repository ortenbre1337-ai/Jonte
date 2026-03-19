import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

try {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
} catch (err) {
  console.error('React startup error:', err);
  document.body.innerHTML = `<div style="color: white; padding: 20px;"><h1>Startup Error</h1><pre>${err}</pre></div>`;
}
