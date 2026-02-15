import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '../news-chat.jsx'

// Polyfill window.storage (mimics the platform API used in the original code)
if (!window.storage) {
  window.storage = {
    async get(key) {
      const value = localStorage.getItem(key);
      return value !== null ? { value } : null;
    },
    async set(key, value) {
      localStorage.setItem(key, value);
    },
  };
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
