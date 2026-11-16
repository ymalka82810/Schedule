import { lazy, type ComponentType } from 'react'

const loaders: Array<() => Promise<unknown>> = []
let scheduled = false

/** טוען ברקע, כשהדפדפן פנוי, את כל החלקים שנטענים בלחיצה. כך הם נפתחים מיד, וגם בלי אינטרנט */
function preloadWhenIdle() {
  if (scheduled || typeof window === 'undefined') return
  scheduled = true
  const run = () => {
    for (const load of loaders) void load().catch(() => {})
  }
  const start = () => {
    // Safari עדיין בלי requestIdleCallback
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 5000 })
    else setTimeout(run, 1500)
  }
  if (document.readyState === 'complete') start()
  else window.addEventListener('load', start, { once: true })
}

/**
 * דיאלוג שהקוד שלו לא חלק מהטעינה הראשונה של האתר.
 * הלוח מופיע מהר יותר, והדיאלוג נטען ברקע מיד אחריו.
 */
export function lazyDialog<T extends ComponentType<any>>(load: () => Promise<T>) {
  let cached: Promise<{ default: T }> | undefined
  const once = () => (cached ??= load().then((c) => ({ default: c })).catch((err) => {
    // ניסיון נוסף בפתיחה הבאה (למשל אחרי שהרשת חזרה)
    cached = undefined
    throw err
  }))
  loaders.push(once)
  preloadWhenIdle()
  return lazy(once)
}
