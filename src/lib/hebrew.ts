import { HDate, HebrewCalendar, flags, type Event } from '@hebcal/core'

/**
 * תאריך עברי, חגים ומועדים (לוח ארץ ישראל).
 * חג = אין לימודים ואין תכנון. ערב חג = היום נגמר מוקדם, כמו ביום שישי.
 */

export type HolidayKind = 'chag' | 'erev' | 'cholhamoed' | 'fast' | 'minor'

export interface DayInfo {
  /** "ה׳ כסלו" */
  hebrew: string
  holiday?: { name: string; kind: HolidayKind }
}

const cache = new Map<string, DayInfo>()

function kindOf(e: Event): HolidayKind | null {
  const f = e.getFlags()
  if (f & flags.CHAG) return 'chag'
  if (f & flags.EREV) return 'erev'
  if (f & flags.CHOL_HAMOED) return 'cholhamoed'
  if (f & flags.MAJOR_FAST) return 'fast'
  if (f & flags.MINOR_HOLIDAY) return 'minor'
  return null
}

const RANK: Record<HolidayKind, number> = { chag: 0, erev: 1, cholhamoed: 2, fast: 3, minor: 4 }

/** date בפורמט YYYY-MM-DD */
export function dayInfo(date: string): DayInfo {
  const hit = cache.get(date)
  if (hit) return hit
  const [y, m, d] = date.split('-').map(Number)
  const greg = new Date(y, m - 1, d)
  const hd = new HDate(greg)
  // "ה׳ כִּסְלֵו תשפ״ז" → "ה׳ כסלו" (בלי ניקוד ובלי שנה)
  const hebrew = hd
    .renderGematriya(true)
    .split(' ')
    .slice(0, -1)
    .join(' ')
  const events = HebrewCalendar.getHolidaysOnDate(hd, true) ?? []
  let holiday: DayInfo['holiday']
  for (const e of events) {
    const kind = kindOf(e)
    if (!kind || (holiday && RANK[holiday.kind] <= RANK[kind])) continue
    holiday = { name: e.render('he-x-NoNikud'), kind }
  }
  const info = { hebrew, holiday }
  cache.set(date, info)
  return info
}

export const isChag = (date: string) => dayInfo(date).holiday?.kind === 'chag'
export const isErev = (date: string) => dayInfo(date).holiday?.kind === 'erev'
