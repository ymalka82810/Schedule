import type { ScheduleData } from '../types'

/**
 * עותק של המערכת של הבעלים במכשיר: מוצג גם בלי חיבור לשרת, ואפשר לערוך אותו.
 * שינוי שעוד לא הגיע לשרת מסומן pending, ונשלח כשהחיבור חוזר (גם אחרי רענון או סגירת הדף).
 */
const KEY = 'schedule:owner-cache'

export interface OwnerCache {
  email: string
  data: ScheduleData
  backup: ScheduleData | null
  savedAt: string
  /** יש שינויים במכשיר שעוד לא נשמרו בשרת */
  pending?: boolean
  /** זמן העדכון של הגרסה בשרת שממנה התחלנו לערוך. כך יודעים אם השרת השתנה בינתיים ממכשיר אחר */
  serverUpdatedAt?: number
}

export function saveOwnerCache(c: Omit<OwnerCache, 'savedAt'>): string {
  const savedAt = new Date().toISOString() + Math.random().toString(36).slice(2, 6)
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...c, savedAt }))
  } catch {
    // אין מקום או אין גישה: ממשיכים בלי עותק
  }
  return savedAt
}

export function loadOwnerCache(): OwnerCache | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as OwnerCache) : null
  } catch {
    return null
  }
}

/** השרת אישר את השמירה. מנקה את הסימון רק אם לא נעשה שינוי חדש בינתיים */
export function markSynced(savedAt: string, serverUpdatedAt: number) {
  const c = loadOwnerCache()
  if (!c || c.savedAt !== savedAt) return
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...c, pending: false, serverUpdatedAt }))
  } catch {
    // לא קריטי: בפעם הבאה יישלח שוב, וזה לא מזיק
  }
}

export function clearOwnerCache() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // לא קריטי
  }
}

/** תאריך ושעה קצרים לתצוגה, מתוך savedAt (שיש בסופו תוספת למניעת כפילות) */
export const savedAtDate = (savedAt: string) => new Date(savedAt.slice(0, 24))

export type SyncDecision =
  | { action: 'none' }
  /** יש שינויים במכשיר והשרת לא השתנה מאז: שולחים */
  | { action: 'upload'; data: ScheduleData; backup: ScheduleData | null }
  /** גם במכשיר וגם בשרת יש שינויים: צריך לשאול איזו גרסה להשאיר */
  | { action: 'conflict'; data: ScheduleData; backup: ScheduleData | null }

/** מה לעשות כשהחיבור לשרת חוזר */
export function decideSync(cache: OwnerCache | null, email: string, serverUpdatedAt: number | undefined): SyncDecision {
  if (!cache?.pending || cache.email !== email) return { action: 'none' }
  const changedOnServer =
    serverUpdatedAt !== undefined && cache.serverUpdatedAt !== undefined && serverUpdatedAt > cache.serverUpdatedAt
  return { action: changedOnServer ? 'conflict' : 'upload', data: cache.data, backup: cache.backup }
}
