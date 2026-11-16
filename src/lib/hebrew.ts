/**
 * תאריך עברי, חגים ומועדים (לוח ארץ ישראל), בלי ספרייה חיצונית.
 * חג = אין לימודים ואין תכנון. ערב חג = היום נגמר מוקדם, כמו ביום שישי.
 *
 * החישוב הוא הלוח העברי הקבוע (מולד, דחיות ואורך שנה). הבדיקות משוות אותו יום-יום,
 * על פני יותר ממאה שנה, לספריית hebcal (ראו __tests__/hebrewOracle.test.ts).
 */

export type HolidayKind = 'chag' | 'erev' | 'cholhamoed' | 'fast' | 'minor'

export interface DayInfo {
  /** "ה׳ כסלו" */
  hebrew: string
  holiday?: { name: string; kind: HolidayKind }
}

export type HebrewMonth =
  | 'tishrei'
  | 'cheshvan'
  | 'kislev'
  | 'tevet'
  | 'shvat'
  | 'adar1'
  | 'adar'
  | 'nisan'
  | 'iyyar'
  | 'sivan'
  | 'tammuz'
  | 'av'
  | 'elul'

export interface HebrewDate {
  year: number
  month: HebrewMonth
  day: number
  leap: boolean
  /** כמה ימים עברו מא׳ בתשרי (0 = ראש השנה) */
  dayOfYear: number
  /** א׳ בכסלו ביום השנה: חנוכה תלויה באורך של חשוון וכסלו */
  kislevStart: number
  /** 0 = ראשון ... 6 = שבת */
  weekday: number
}

/** שנה מעוברת: 7 מתוך כל 19 */
const isLeap = (year: number) => (7 * year + 1) % 19 < 7

/** ימים מתחילת הספירה עד המולד של תשרי, אחרי דחיית "לא אד״ו ראש" */
function elapsedDays(year: number): number {
  const months = Math.floor((235 * year - 234) / 19)
  const parts = 12084 + 13753 * months
  const days = months * 29 + Math.floor(parts / 25920)
  return (3 * (days + 1)) % 7 < 3 ? days + 1 : days
}

/** א׳ בתשרי כמספר יום רץ, אחרי הדחיות שמונעות שנה באורך לא חוקי */
function newYear(year: number): number {
  const prev = elapsedDays(year - 1)
  const here = elapsedDays(year)
  const next = elapsedDays(year + 1)
  return here + (next - here === 356 ? 2 : here - prev === 382 ? 1 : 0)
}

/** היום הרץ של א׳ בתשרי ה׳תש״ל (1969-09-13), לעיגון מול הלוח הלועזי */
const ANCHOR_YEAR = 5730
const ANCHOR_UTC_DAY = Date.UTC(1969, 8, 13) / 86_400_000
const ANCHOR = newYear(ANCHOR_YEAR)

/** א׳ בתשרי של השנה, כמספר ימים מ-1970-01-01 */
const newYearDay = (year: number) => ANCHOR_UTC_DAY + newYear(year) - ANCHOR

function monthsOf(year: number): Array<[HebrewMonth, number]> {
  const length = newYear(year + 1) - newYear(year)
  const leap = isLeap(year)
  return [
    ['tishrei', 30],
    ['cheshvan', length % 10 === 5 ? 30 : 29],
    ['kislev', length % 10 === 3 ? 29 : 30],
    ['tevet', 29],
    ['shvat', 30],
    ...(leap ? ([['adar1', 30]] as Array<[HebrewMonth, number]>) : []),
    ['adar', 29],
    ['nisan', 30],
    ['iyyar', 29],
    ['sivan', 30],
    ['tammuz', 29],
    ['av', 30],
    ['elul', 29],
  ]
}

/** התאריך העברי של תאריך לועזי (שנה, חודש 1–12, יום) */
export function toHebrew(y: number, m: number, d: number): HebrewDate {
  const utcDay = Date.UTC(y, m - 1, d) / 86_400_000
  let year = y + 3760
  if (utcDay >= newYearDay(year + 1)) year++
  const dayOfYear = utcDay - newYearDay(year)
  const months = monthsOf(year)
  let left = dayOfYear
  let at = 0
  while (left >= months[at][1]) left -= months[at++][1]
  return {
    year,
    month: months[at][0],
    day: left + 1,
    leap: isLeap(year),
    dayOfYear,
    kislevStart: months[0][1] + months[1][1],
    // 1970-01-01 היה יום חמישי
    weekday: (((utcDay + 4) % 7) + 7) % 7,
  }
}

const MONTH_NAMES: Record<HebrewMonth, string> = {
  tishrei: 'תשרי',
  cheshvan: 'חשון',
  kislev: 'כסלו',
  tevet: 'טבת',
  shvat: 'שבט',
  adar1: 'אדר א׳',
  adar: 'אדר',
  nisan: 'ניסן',
  iyyar: 'אייר',
  sivan: 'סיון',
  tammuz: 'תמוז',
  av: 'אב',
  elul: 'אלול',
}

const ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט']
const TENS = ['', 'י', 'כ', 'ל']

/** 1–30 באותיות: ה׳, ט״ו, כ״ג, ל׳ */
export function gematriya(n: number): string {
  const letters = n === 15 ? 'טו' : n === 16 ? 'טז' : TENS[Math.floor(n / 10)] + ONES[n % 10]
  return letters.length === 1 ? `${letters}׳` : `${letters[0]}״${letters[1]}`
}

type Holiday = NonNullable<DayInfo['holiday']>
const h = (kind: HolidayKind, name: string): Holiday => ({ kind, name })

/** החג או המועד של התאריך, לפי לוח ארץ ישראל */
function holidayOf(hd: HebrewDate): Holiday | undefined {
  const { month, day, weekday } = hd

  // חנוכה: שמונה ימים מכ״ה בכסלו, גם כשכסלו חסר והיא גולשת לג׳ בטבת
  const chanukah = hd.dayOfYear - (hd.kislevStart + 24)
  if (chanukah === -1) return h('minor', 'חנוכה: א׳ נר')
  if (chanukah >= 0 && chanukah <= 6) return h('minor', `חנוכה: ${gematriya(chanukah + 2)} נרות`)
  if (chanukah === 7) return h('minor', 'חנוכה: יום ח׳')

  switch (month) {
    case 'tishrei':
      if (day === 1) return h('chag', 'ראש השנה')
      if (day === 2) return h('chag', 'ראש השנה ב׳')
      if (day === 9) return h('erev', 'ערב יום כיפור')
      if (day === 10) return h('chag', 'יום כיפור')
      if (day === 14) return h('erev', 'ערב סוכות')
      if (day === 15) return h('chag', 'סוכות א׳')
      if (day >= 16 && day <= 20) return h('cholhamoed', `סוכות ${gematriya(day - 14)} (חוה״מ)`)
      if (day === 21) return h('cholhamoed', 'סוכות ז׳ (הושענא רבה)')
      if (day === 22) return h('chag', 'שמיני עצרת')
      return
    case 'shvat':
      if (day === 15) return h('minor', 'ט״ו בשבט')
      return
    case 'adar1':
      if (day === 14) return h('minor', 'פורים קטן')
      if (day === 15) return h('minor', 'שושן פורים קטן')
      return
    case 'adar':
      if (day === 13) return h('erev', 'ערב פורים')
      if (day === 14) return h('minor', 'פורים')
      if (day === 15) return h('minor', 'שושן פורים')
      // שושן פורים בשבת: בירושלים הסעודה נדחית ליום ראשון
      if (day === 16 && weekday === 0) return h('minor', 'פורים משולש')
      return
    case 'nisan':
      if (day === 14) return h('erev', 'ערב פסח')
      if (day === 15) return h('chag', 'פסח א׳')
      if (day >= 16 && day <= 20) return h('cholhamoed', `פסח ${gematriya(day - 14)} (חוה״מ)`)
      if (day === 21) return h('chag', 'פסח ז׳')
      return
    case 'iyyar':
      if (day === 14) return h('minor', 'פסח שני')
      if (day === 18) return h('minor', 'ל״ג בעומר')
      return
    case 'sivan':
      if (day === 5) return h('erev', 'ערב שבועות')
      if (day === 6) return h('chag', 'שבועות')
      return
    case 'av':
      // ט׳ באב שחל בשבת נדחה ליום ראשון, והערב שלו הוא השבת עצמה
      if (day === 8 && weekday !== 5) return h('erev', 'ערב תשעה באב')
      if (day === 9) return weekday === 6 ? h('erev', 'ערב תשעה באב') : h('fast', 'תשעה באב')
      if (day === 10 && weekday === 0) return h('fast', 'תשעה באב (נדחה)')
      if (day === 15) return h('minor', 'ט״ו באב')
      return
    case 'elul':
      if (day === 29) return h('erev', 'ערב ראש השנה')
      return
    default:
      return
  }
}

const cache = new Map<string, DayInfo>()

/** date בפורמט YYYY-MM-DD */
export function dayInfo(date: string): DayInfo {
  const hit = cache.get(date)
  if (hit) return hit
  const [y, m, d] = date.split('-').map(Number)
  const hd = toHebrew(y, m, d)
  const monthName = hd.month === 'adar' && hd.leap ? 'אדר ב׳' : MONTH_NAMES[hd.month]
  const info: DayInfo = { hebrew: `${gematriya(hd.day)} ${monthName}`, holiday: holidayOf(hd) }
  cache.set(date, info)
  return info
}

export const isChag = (date: string) => dayInfo(date).holiday?.kind === 'chag'
export const isErev = (date: string) => dayInfo(date).holiday?.kind === 'erev'
