import { describe, expect, it } from 'vitest'
import { HDate, HebrewCalendar, Location, Zmanim, flags, type Event } from '@hebcal/core'
import { dayInfo, type HolidayKind } from '../hebrew'
import { CITIES, zmanimOn } from '../routines'

/**
 * הלוח העברי וזמני היום שלנו מול ספריית hebcal, יום-יום.
 * hebcal מותקנת רק לבדיקות: היא שוקלת יותר מכל שאר הקוד של האתר, ולכן האתר עצמו מחשב לבד.
 */

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const RANK: Record<HolidayKind, number> = { chag: 0, erev: 1, cholhamoed: 2, fast: 3, minor: 4 }

/** מועדים ש-hebcal מציגה ואנחנו בכוונה לא: נדירים, או לא משפיעים על סדר היום */
const SKIPPED = ['Birkat Hachamah', 'Chag HaBanot', 'Rosh Hashana LaBehemot', 'Leil Selichot']

function kindOf(e: Event): HolidayKind | null {
  const f = e.getFlags()
  // נר ראשון של חנוכה מסומן ב-hebcal כ"ערב", אבל היום לא מתקצר בו כמו בערב חג
  if (f & flags.CHANUKAH_CANDLES) return 'minor'
  if (f & flags.CHAG) return 'chag'
  if (f & flags.EREV) return 'erev'
  if (f & flags.CHOL_HAMOED) return 'cholhamoed'
  if (f & flags.MAJOR_FAST) return 'fast'
  if (f & flags.MINOR_HOLIDAY) return 'minor'
  return null
}

/** השם כמו ב-hebcal, עם שני תיקוני תצוגה: בלי מספר שנה בראש השנה, וסוגריים במקומם */
const nameOf = (e: Event) =>
  e
    .render('he-x-NoNikud')
    .replace(/^ראש השנה \d+$/, 'ראש השנה')
    .replace('(תשעה באב (נדחה', 'תשעה באב (נדחה)')

function expected(date: Date) {
  const hd = new HDate(date)
  const hebrew = hd.renderGematriya(true).split(' ').slice(0, -1).join(' ')
  let holiday: { name: string; kind: HolidayKind } | undefined
  for (const e of HebrewCalendar.getHolidaysOnDate(hd, true) ?? []) {
    const kind = kindOf(e)
    if (!kind || SKIPPED.includes(e.getDesc())) continue
    if (holiday && RANK[holiday.kind] <= RANK[kind]) continue
    holiday = { name: nameOf(e), kind }
  }
  return { hebrew, holiday }
}

describe('הלוח העברי מול hebcal', () => {
  it('תאריך עברי וחגים זהים בכל יום, 1950 עד 2150', () => {
    const wrong: string[] = []
    let holidays = 0
    for (const d = new Date(1950, 0, 1, 12); d.getFullYear() < 2150; d.setDate(d.getDate() + 1)) {
      const want = expected(d)
      const got = dayInfo(iso(d))
      if (want.holiday) holidays++
      if (got.hebrew !== want.hebrew || got.holiday?.name !== want.holiday?.name || got.holiday?.kind !== want.holiday?.kind) {
        if (wrong.length < 15) wrong.push(`${iso(d)}: ${JSON.stringify(got)} במקום ${JSON.stringify(want)}`)
      }
    }
    expect(wrong).toEqual([])
    // לוודא שההשוואה באמת עברה על חגים, ולא על רשימה ריקה
    expect(holidays).toBeGreaterThan(200 * 40)
  })

  it('תאריכים מוכרים', () => {
    expect(dayInfo('2026-09-12')).toEqual({ hebrew: 'א׳ תשרי', holiday: { name: 'ראש השנה', kind: 'chag' } })
    expect(dayInfo('2026-11-16').hebrew).toBe('ו׳ כסלו')
    expect(dayInfo('2026-12-04').holiday).toEqual({ name: 'חנוכה: א׳ נר', kind: 'minor' })
    expect(dayInfo('2027-03-23').holiday).toEqual({ name: 'פורים', kind: 'minor' })
  })
})

describe('זמני היום מול hebcal', () => {
  it('כל הזמנים בכל הערים, כל יום במשך שנתיים, בהפרש של דקה לכל היותר', () => {
    let worst = 0
    const wrong: string[] = []
    for (const { key } of CITIES) {
      const loc = Location.lookup(key)!
      for (const d = new Date(2026, 0, 1, 12); d.getFullYear() < 2028; d.setDate(d.getDate() + 1)) {
        const z = new Zmanim(loc, new Date(d.getFullYear(), d.getMonth(), d.getDate()), false)
        const min = (t: Date) => {
          const s = Zmanim.formatISOWithTimeZone(loc.getTzid(), t)
          return Number(s.slice(11, 13)) * 60 + Number(s.slice(14, 16))
        }
        const want = {
          alot: min(z.alotHaShachar()),
          sunrise: min(z.sunrise()),
          chatzot: min(z.chatzot()),
          minchaGedola: min(z.minchaGedola()),
          minchaKetana: min(z.minchaKetana()),
          plag: min(z.plagHaMincha()),
          sunset: min(z.sunset()),
          tzeit: min(z.tzeit()),
        }
        const got = zmanimOn(iso(d), key)!
        for (const k of Object.keys(want) as Array<keyof typeof want>) {
          const diff = Math.abs(got[k] - want[k])
          worst = Math.max(worst, diff)
          if (diff > 1 && wrong.length < 10) wrong.push(`${key} ${iso(d)} ${k}: ${got[k]} במקום ${want[k]}`)
        }
      }
    }
    expect(wrong).toEqual([])
    expect(worst).toBeLessThanOrEqual(1)
  })
})
