import { Location, Zmanim } from '@hebcal/core'
import type { DayIndex, Minutes, Routine, TimeRef, Zman } from '../types'
import { formatTime } from './time'

/**
 * שגרות קבועות (ארוחות, תפילות) וזמני היום.
 * שגרה צריכה X דקות בתוך חלון, והתכנון שומר לה מקום לפני שהוא משבץ תרגול.
 */

export const ZMAN_NAMES: Record<Zman, string> = {
  alot: 'עלות השחר',
  sunrise: 'הנץ',
  chatzot: 'חצות היום',
  minchaGedola: 'מנחה גדולה',
  minchaKetana: 'מנחה קטנה',
  plag: 'פלג המנחה',
  sunset: 'שקיעה',
  tzeit: 'צאת הכוכבים',
}

/** ערים לבחירה: שם בעברית ושם ב-hebcal */
export const CITIES: Array<{ he: string; key: string }> = [
  { he: 'ירושלים', key: 'Jerusalem' },
  { he: 'תל אביב', key: 'Tel Aviv' },
  { he: 'חיפה', key: 'Haifa' },
  { he: 'באר שבע', key: 'Beer Sheva' },
  { he: 'פתח תקווה', key: 'Petach Tikvah' },
  { he: 'אשדוד', key: 'Ashdod' },
  { he: 'אילת', key: 'Eilat' },
]

const zmanCache = new Map<string, Record<Zman, Minutes>>()

/** זמני היום בתאריך (YYYY-MM-DD) בעיר, בדקות מחצות לפי השעון המקומי של העיר */
export function zmanimOn(date: string, city = 'Jerusalem'): Record<Zman, Minutes> | null {
  const key = `${city}|${date}`
  const hit = zmanCache.get(key)
  if (hit) return hit
  const loc = Location.lookup(city) ?? Location.lookup('Jerusalem')
  if (!loc) return null
  const [y, m, d] = date.split('-').map(Number)
  const z = new Zmanim(loc, new Date(y, m - 1, d), false)
  const tz = loc.getTzid()
  const min = (t: Date) => {
    const iso = Zmanim.formatISOWithTimeZone(tz, t)
    return Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16))
  }
  const out: Record<Zman, Minutes> = {
    alot: min(z.alotHaShachar()),
    sunrise: min(z.sunrise()),
    chatzot: min(z.chatzot()),
    minchaGedola: min(z.minchaGedola()),
    minchaKetana: min(z.minchaKetana()),
    plag: min(z.plagHaMincha()),
    sunset: min(z.sunset()),
    tzeit: min(z.tzeit()),
  }
  zmanCache.set(key, out)
  return out
}

/** שעה של עוגן בתאריך. זמן מזמני היום שלא אפשר לחשב = null */
export function resolveTime(ref: TimeRef, date: string, city?: string): Minutes | null {
  if ('at' in ref) return ref.at
  const z = zmanimOn(date, city)
  return z ? z[ref.zman] + ref.offset : null
}

/** תיאור של עוגן: "13:00" או "20 דק' לפני שקיעה" */
export function describeRef(ref: TimeRef): string {
  if ('at' in ref) return formatTime(ref.at)
  const name = ZMAN_NAMES[ref.zman]
  if (!ref.offset) return name
  return `${Math.abs(ref.offset)} דק' ${ref.offset < 0 ? 'לפני' : 'אחרי'} ${name}`
}

export interface PlacedRoutine {
  routineId: string
  name: string
  day: DayIndex
  start: Minutes
  end: Minutes
  /** החלון שבו השגרה יכולה להיות, להסבר */
  windowStart: Minutes
  windowEnd: Minutes
}

interface Span {
  start: Minutes
  end: Minutes
}

/**
 * שומר מקום לשגרות בכל יום: בתוך החלון, לא על שיעור או אירוע, וצמוד לסוף שיעור או לתחילתו אם אפשר,
 * כדי לא לחתוך את הזמן הפנוי לחתיכות קטנות. חלון שכולו תפוס: השגרה לא נשמרת (קורה בתוך הלימודים).
 */
export function placeRoutines(
  routines: Routine[],
  dates: string[],
  busyOf: (day: DayIndex) => Span[],
  city?: string,
  skipDay?: (day: DayIndex) => boolean,
  /** שעות היום הפעיל: שגרה עדיף בתוכן, ולא לפני הקימה */
  active?: Span,
): PlacedRoutine[] {
  const out: PlacedRoutine[] = []
  for (let day = 0 as DayIndex; day < 7; day = (day + 1) as DayIndex) {
    if (skipDay?.(day)) continue
    const taken: Span[] = [...busyOf(day)]
    for (const r of routines) {
      if (!r.days.includes(day) || r.minutes <= 0) continue
      const from = resolveTime(r.from, dates[day], city)
      const to = resolveTime(r.to, dates[day], city)
      if (from === null || to === null || to - from < r.minutes) continue
      let best: { start: Minutes; score: number } | null = null
      // נקודות לבדיקה: כל 5 דקות עגולות, קצוות החלון, ומיד אחרי או לפני כל דבר תפוס
      const points = new Set<Minutes>([from, to - r.minutes])
      for (let t = Math.ceil(from / 5) * 5; t + r.minutes <= to; t += 5) points.add(t)
      for (const b of taken) points.add(b.end).add(b.start - r.minutes)
      for (const t of [...points].sort((a, b) => a - b)) {
        if (t < from || t + r.minutes > to) continue
        const end = t + r.minutes
        if (taken.some((b) => b.start < end && t < b.end)) continue
        // צמוד לדבר תפוס או לקצה החלון עדיף: לא משאיר חור קטן ומבוזבז
        let score = 0
        if (taken.some((b) => b.end === t || b.start === end)) score += 3
        if (t === from || end === to) score += 1
        if (active && t >= active.start && end <= active.end) score += 2
        // בין שווים: מוקדם יותר
        score -= (t - from) / 10_000
        if (!best || score > best.score) best = { start: t, score }
      }
      if (!best) continue
      const placed = { start: best.start, end: best.start + r.minutes }
      taken.push(placed)
      out.push({ routineId: r.id, name: r.name, day, ...placed, windowStart: from, windowEnd: to })
    }
  }
  return out
}

/** שגרות מוכנות לבחירה בלחיצה */
export const ROUTINE_PRESETS: Array<Omit<Routine, 'id'>> = [
  { name: 'ארוחת בוקר', days: [0, 1, 2, 3, 4, 5], from: { at: 7 * 60 }, to: { at: 9 * 60 + 30 }, minutes: 20 },
  { name: 'ארוחת צהריים', days: [0, 1, 2, 3, 4, 5], from: { at: 12 * 60 }, to: { at: 14 * 60 + 30 }, minutes: 30 },
  { name: 'ארוחת ערב', days: [0, 1, 2, 3, 4], from: { at: 18 * 60 + 30 }, to: { at: 20 * 60 + 30 }, minutes: 30 },
  {
    name: 'שחרית',
    days: [0, 1, 2, 3, 4, 5],
    from: { zman: 'sunrise', offset: -30 },
    to: { zman: 'sunrise', offset: 150 },
    minutes: 45,
  },
  {
    name: 'מנחה',
    days: [0, 1, 2, 3, 4, 5],
    from: { zman: 'minchaGedola', offset: 0 },
    to: { zman: 'sunset', offset: 0 },
    minutes: 20,
  },
  {
    name: 'ערבית',
    days: [0, 1, 2, 3, 4],
    from: { zman: 'tzeit', offset: 0 },
    to: { zman: 'tzeit', offset: 180 },
    minutes: 15,
  },
]
