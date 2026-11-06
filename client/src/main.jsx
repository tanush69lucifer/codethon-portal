import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './components/ui';
import { refreshSebKeys } from './lib/seb';
import '@fontsource-variable/unbounded';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource-variable/bricolage-grotesque/opsz.css';
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource/vt323';
import './styles.css';
import './codezis.css';
import './codezis-spectrum.css';

refreshSebKeys();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <App />
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);
