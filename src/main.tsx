import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthRoot } from './auth/AuthRoot.tsx'
import { emptyData } from './data/empty.ts'

// בלי כתובת Convex (עוד לא חוברה, או פיתוח מקומי) האתר רץ כסביבת בדיקה בזיכרון, בלי התחברות
const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {convexUrl ? (
      <AuthRoot url={convexUrl} />
    ) : (
      <App initialData={emptyData} initialBackup={null} account={{ kind: 'local' }} />
    )}
  </StrictMode>,
)
