import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { setupKeyboardInsetWatcher } from './lib/keyboard-inset'
import { setupSafeAreaFallback } from './lib/safe-area'
import './index.css'
import { setupDesktopLifecycle } from './lib/desktop-lifecycle'

setupSafeAreaFallback()
setupKeyboardInsetWatcher()
setupDesktopLifecycle()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
