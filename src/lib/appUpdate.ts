/**
 * התקנה כאפליקציה, עבודה בלי אינטרנט, וזיהוי של גרסה חדשה.
 * כשגרסה חדשה של האתר מותקנת ברקע בזמן שהדף פתוח, מודיעים, כדי שאפשר יהיה לרענן
 * ולא להישאר על הגרסה הישנה עד הכניסה הבאה.
 */

type Listener = () => void

let available = false
const listeners = new Set<Listener>()

/** האם הותקנה גרסה חדשה מאז שהדף נטען */
export const updateAvailable = () => available

export function onUpdateAvailable(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** כל כמה זמן לבדוק אם יש גרסה חדשה, כשחוזרים ללשונית */
const CHECK_EVERY = 30 * 60_000

export function registerServiceWorker(url: string): void {
  if (!('serviceWorker' in navigator)) return
  const sw = navigator.serviceWorker
  // בביקור הראשון אין עדיין service worker ששולט בדף, וההתקנה שלו אינה "גרסה חדשה"
  const hadController = !!sw.controller
  sw.addEventListener('controllerchange', () => {
    if (!hadController || available) return
    available = true
    listeners.forEach((l) => l())
  })

  window.addEventListener('load', () => {
    sw.register(url)
      .then((registration) => {
        // הדפדפן בודק עדכון רק בכניסה לאתר. דף שנשאר פתוח ימים (אפליקציה מותקנת) בודק גם בחזרה אליו
        let checked = Date.now()
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState !== 'visible' || Date.now() - checked < CHECK_EVERY) return
          checked = Date.now()
          registration.update().catch(() => {})
        })
      })
      .catch((err) => console.warn('service worker', err))
  })
}
