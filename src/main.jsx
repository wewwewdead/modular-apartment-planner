import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppRouter } from './routes';
import './styles/fonts.css';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>,
);

// The PWA service worker (vite-plugin-pwa builds it; `injectRegister: false`
// leaves registering to here). The same registration the plugin's injected
// script made, but only for a page served over http(s): the desktop shell
// loads the build from file://, where registration can only fail. Dev serves
// no worker at all.
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' });
  });
}
