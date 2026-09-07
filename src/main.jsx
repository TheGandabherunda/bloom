import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Strip intensive console logging to prevent JS thread locking and UI lag during audio/p2p sync
const noop = () => {};
console.log = noop;
console.info = noop;
console.debug = noop;

// Unregister any legacy service workers that might interfere with Vite
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister();
    }
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
