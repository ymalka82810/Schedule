import type { ScheduleData } from '../types'
import { initialData } from '../data/initial'

const DATA_KEY = 'schedule:data'
const THEME_KEY = 'schedule:theme'

export type Theme = 'light' | 'dark'

/** טוען את המערכת השמורה. אם אין או שהיא פגומה, מחזיר את המערכת ההתחלתית */
export function loadData(): ScheduleData {
  try {
    const raw = localStorage.getItem(DATA_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as ScheduleData
      if (parsed && parsed.version === 1 && Array.isArray(parsed.entries)) return parsed
    }
  } catch {
    // נופלים להמערכת ההתחלתית
  }
  return initialData
}

export function saveData(data: ScheduleData): void {
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(data))
  } catch {
    // אחסון חסום או מלא: ממשיכים לעבוד בזיכרון
  }
}

export function loadTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY)
    if (t === 'light' || t === 'dark') return t
  } catch {
    // ברירת מחדל לפי המערכת
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // לא קריטי
  }
}
