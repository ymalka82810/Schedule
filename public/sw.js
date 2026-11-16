// Service worker: האתר נפתח גם בלי אינטרנט, כבר אחרי הביקור הראשון.
// בהתקנה נשמרים כל קובצי הגרסה (הרשימה נכתבת כאן בזמן הבנייה, ראו vite.config.ts).
// דפים: קודם מהרשת, ואם אין רשת או שהיא איטית מדי, מהזיכרון.
// קבצים עם חותמת בשם (assets): מהזיכרון, בלי לבדוק ברשת. הם לא משתנים לעולם.
// שאר הקבצים (אייקונים, manifest): מהזיכרון, ומתעדכנים ברקע.
// בקשות לשרת (Convex) לא עוברות כאן בכלל.
const BUILD = '__BUILD__'
const PRECACHE = [/*__PRECACHE__*/]
const CACHE = `schedule-${BUILD}`
/** כמה לחכות לדף מהרשת לפני שמציגים את השמור (רשת חלשה) */
const NAVIGATE_TIMEOUT = 3500
// השרת מוסיף Vary, ואז בקשה של תגית script לא מוצאת קובץ שנשמר בהתקנה. הקבצים זהים לכל בקשה
const MATCH = { ignoreVary: true }

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(['./', ...PRECACHE]))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

const put = (cacheName, req, res) => {
  if (res.ok || res.type === 'opaque') {
    const copy = res.clone()
    caches.open(cacheName).then((c) => c.put(req, copy))
  }
  return res
}

/** מהזיכרון אם יש, אחרת מהרשת (ונשמר) */
const cacheFirst = (cacheName, req) =>
  caches.match(req, MATCH).then((hit) => hit || fetch(req).then((res) => put(cacheName, req, res)))

/** מהזיכרון מיד, ועדכון ברקע לפעם הבאה */
const staleWhileRevalidate = (cacheName, req) =>
  caches.match(req, MATCH).then((hit) => {
    const fresh = fetch(req)
      .then((res) => put(cacheName, req, res))
      .catch(() => hit)
    return hit || fresh
  })

/** הדף עצמו: מהרשת, ואם היא לא עונה בזמן או נפלה, הדף השמור */
const navigate = (req) =>
  new Promise((resolve) => {
    let settled = false
    const fallback = () =>
      caches.match('./', MATCH).then((hit) => {
        if (hit && !settled) {
          settled = true
          resolve(hit)
        }
        return hit
      })
    const timer = setTimeout(fallback, NAVIGATE_TIMEOUT)
    fetch(req)
      .then((res) => {
        clearTimeout(timer)
        if (res.ok) {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('./', copy))
        }
        if (!settled) {
          settled = true
          resolve(res)
        }
      })
      .catch(() => {
        clearTimeout(timer)
        fallback().then((hit) => {
          if (!hit && !settled) {
            settled = true
            resolve(Response.error())
          }
        })
      })
  })

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // רק בתוך האתר הזה (באותו דומיין של GitHub Pages יש גם אתרים אחרים)
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return

  if (req.mode === 'navigate') event.respondWith(navigate(req))
  else if (url.pathname.includes('/assets/')) event.respondWith(cacheFirst(CACHE, req))
  else event.respondWith(staleWhileRevalidate(CACHE, req))
})
