import type { DayIndex, Minutes } from '../types'

export const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'] as const
export const DAYS: DayIndex[] = [0, 1, 2, 3, 4, 5, 6]

export const hm = (h: number, m = 0): Minutes => h * 60 + m

export function formatTime(min: Minutes): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

/** יום ראשון של השבוע שבו נמצא התאריך, בחצות */
export function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() - d.getDay())
  return d
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** YYYY-MM-DD לפי השעון המקומי */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** תאריך של יום בשבוע: weekStart הוא יום ראשון */
export const dateOfDay = (weekStart: Date, day: number) => isoDate(addDays(weekStart, day))

export const minutesOfDay = (d: Date): Minutes => d.getHours() * 60 + d.getMinutes()

const rangeFmt = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long' })
const yearFmt = new Intl.DateTimeFormat('he-IL', { year: 'numeric' })

/** "8–14 בנובמבר 2026" או "29 בנובמבר – 5 בדצמבר 2026" */
export function formatWeekRange(weekStart: Date): string {
  const end = addDays(weekStart, 6)
  const year = yearFmt.format(end)
  if (weekStart.getMonth() === end.getMonth()) {
    const month = new Intl.DateTimeFormat('he-IL', { month: 'long' }).format(end)
    // \u2066...\u2069 שומר על הטווח משמאל לימין בתוך טקסט עברי
    return `\u2066${weekStart.getDate()}–${end.getDate()}\u2069 ב${month} ${year}`
  }
  return `${rangeFmt.format(weekStart)} – ${rangeFmt.format(end)} ${year}`
}

/** דקות → ערך לשדה type="time" ("09:05") */
export const toTimeInput = (m: Minutes) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/** ערך משדה type="time" → דקות, או null אם השדה ריק או לא תקין */
export function fromTimeInput(v: string): Minutes | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/** "18.10.2026" → "2026-10-18", או undefined */
export function fromDotted(s: string | undefined): string | undefined {
  const m = s ? /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s.trim()) : null
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : undefined
}
