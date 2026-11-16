const THEME_KEY = 'schedule:theme'

export type Theme = 'light' | 'dark'

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

/** דגל קטן שנשמר במכשיר, למשל "כבר ראיתי את הטיפ" */
export function loadFlag(name: string): boolean {
  try {
    return localStorage.getItem(`schedule:${name}`) === '1'
  } catch {
    return false
  }
}

export function saveFlag(name: string, on: boolean): void {
  try {
    if (on) localStorage.setItem(`schedule:${name}`, '1')
    else localStorage.removeItem(`schedule:${name}`)
  } catch {
    // לא קריטי
  }
}
