import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { sanitizeLocalStorage } from './utils/security';

// Clean and secure localStorage on initial load
sanitizeLocalStorage();

// Silence console text
console.log = () => {};
console.info = () => {};
console.debug = () => {};
console.warn = () => {};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);