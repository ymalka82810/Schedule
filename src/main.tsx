import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthRoot } from './auth/AuthRoot.tsx'
import { emptyData } from './data/empty.ts'
import { initialData } from './data/initial.ts'

// בלי כתובת Convex (עוד לא חוברה, או פיתוח מקומי) האתר רץ כסביבת בדיקה בזיכרון, בלי התחברות
const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined

// בפיתוח מקומי: ‎?demo פותח את המערכת לדוגמה במקום לוח ריק, כדי לראות את הלוח מלא
const demo = new URLSearchParams(location.search).has('demo')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {convexUrl ? (
      <AuthRoot url={convexUrl} />
    ) : (
      <App initialData={demo ? initialData : emptyData} initialBackup={null} account={{ kind: 'local' }} />
    )}
  </StrictMode>,
)

// התקנה כאפליקציה ועבודה בלי אינטרנט. רק באתר החי, כדי לא להפריע בפיתוח
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((err) => console.warn('service worker', err))
  })
}
