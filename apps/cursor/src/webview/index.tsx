import { createRoot } from 'react-dom/client'
import { App } from './App'

const root = document.getElementById('root')

if (!root) {
  throw new Error("Root element not found. Cannot initialize webview.")
}

if (root) {
  createRoot(root).render(<App />)
}
