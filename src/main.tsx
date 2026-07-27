import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { setupKeyboardInsetWatcher } from './lib/keyboard-inset'
import { setupSafeAreaFallback } from './lib/safe-area'
import './index.css'

setupSafeAreaFallback()
setupKeyboardInsetWatcher()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
