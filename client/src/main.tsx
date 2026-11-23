// The entry point Vite loads from index.html: it mounts the React app into the page.

// StrictMode runs extra checks in development (effects run twice, to catch missing cleanups).
import { StrictMode } from 'react'
// React's DOM renderer.
import { createRoot } from 'react-dom/client'
// All the styles; Vite bundles the CSS alongside the code.
import './index.css'
// The app itself.
import App from './App.tsx'

// The <div id="root"> in index.html. The ! tells TypeScript it is never null, which holds
// because index.html always has it.
const root = document.getElementById('root')!

// Renders the app inside it.
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
