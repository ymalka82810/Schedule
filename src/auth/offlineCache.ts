import type { ScheduleData } from '../types'

/**
 * עותק של המערכת של הבעלים במכשיר, כדי שהיא תוצג גם בלי חיבור לשרת.
 * נשמר בכל טעינה מהשרת ובכל שינוי.
 */
const KEY = 'schedule:owner-cache'

export interface OwnerCache {
  email: string
  data: ScheduleData
  backup: ScheduleData | null
  savedAt: string
}

export function saveOwnerCache(c: Omit<OwnerCache, 'savedAt'>) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...c, savedAt: new Date().toISOString() }))
  } catch {
    // אין מקום או אין גישה: ממשיכים בלי עותק
  }
}

export function loadOwnerCache(): OwnerCache | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as OwnerCache) : null
  } catch {
    return null
  }
}

export function clearOwnerCache() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // לא קריטי
  }
}
