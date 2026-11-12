import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthRoot } from './auth/AuthRoot.tsx'

// בלי כתובת Convex (עוד לא חוברה, או פיתוח מקומי בלי שרת) האתר עובד כמו קודם, בלי התחברות
const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {convexUrl ? (
      <AuthRoot url={convexUrl}>
        <App />
      </AuthRoot>
    ) : (
      <App />
    )}
  </StrictMode>,
)
