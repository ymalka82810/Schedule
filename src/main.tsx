import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './fonts/fonts.css'
import './index.css'
import App from './App.tsx'
import { AuthRoot } from './auth/AuthRoot.tsx'
import { CrashScreen, ErrorBoundary } from './components/ErrorBoundary.tsx'
import { emptyData } from './data/empty.ts'
import { registerServiceWorker } from './lib/appUpdate.ts'
import { initialData } from './data/initial.ts'

// בלי כתובת Convex (עוד לא חוברה, או פיתוח מקומי) האתר רץ כסביבת בדיקה בזיכרון, בלי התחברות
const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined

// בפיתוח מקומי: ‎?demo פותח את המערכת לדוגמה במקום לוח ריק, כדי לראות את הלוח מלא
const demo = new URLSearchParams(location.search).has('demo')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary fallback={(_reset, error) => <CrashScreen error={error} />}>
      {convexUrl ? (
        <AuthRoot url={convexUrl} />
      ) : (
        <App initialData={demo ? initialData : emptyData} initialBackup={null} account={{ kind: 'local' }} />
      )}
    </ErrorBoundary>
  </StrictMode>,
)

// התקנה כאפליקציה ועבודה בלי אינטרנט. רק באתר החי, כדי לא להפריע בפיתוח
if (import.meta.env.PROD) registerServiceWorker(`${import.meta.env.BASE_URL}sw.js`)
