import React from 'react';
import ReactDOM from 'react-dom/client';
// Third-party stylesheet exception: Leaflet core positioning & tile coordination CSS
import 'leaflet/dist/leaflet.css';
// Pure Tailwind CSS entrypoint (zero custom CSS rules)
import './index.css';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
