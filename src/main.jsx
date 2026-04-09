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

// PWA service worker auto-registered by vite-plugin-pwa
