import { beforeAll, describe, expect, it } from 'vitest'
import { readPdfPages } from './readNode'
import { isYearCalendar, parseYearCalendar, type YearCalendar } from '../yearCalendar'
import type { RawPage } from '../raw'
import { applyCalendarImport, matchSubject, planCalendarImport } from '../../yearCalendarImport'
import { initialData } from '../../../data/initial'
import { buildBlocks } from '../../layout'
import { dayLabels, planWeek } from '../../plan'
import { startOfWeek } from '../../time'

/** הלוח השנתי האמיתי של המכינה לתשפ"ז, מול המערכת של יוחאי */
const path = (name: string) => decodeURIComponent(new URL(`./files/${name}`, import.meta.url).pathname)

let pages: RawPage[]
let cal: YearCalendar
beforeAll(async () => {
  pages = await readPdfPages(path('mechina-year-5787.pdf'))
  cal = parseYearCalendar(pages)
}, 30_000)

const item = (title: string) => cal.items.find((i) => i.title === title)!
const dates = (title: string) => {
  const i = item(title)
  return i.to && i.to !== i.from ? `${i.from}..${i.to}` : i.from
}

describe('קריאת הלוח השנתי של המכינה', () => {
  it('מזהה לוח שנתי, ולא מתבלבל עם מערכת שעות', async () => {
    expect(isYearCalendar(pages)).toBe(true)
    expect(isYearCalendar(await readPdfPages(path('mechina-2026-10-18.pdf')))).toBe(false)
  }, 30_000)

  it('שנת הלימודים מהכותרת: תשפ"ז מתחילה ב-2026', () => {
    expect(cal.title).toBe('לוח זמנים מכינה לשנה"ל תשפ"ז')
    expect(cal.startYear).toBe(2026)
  })

  it('חופשות, כולל טווח על שתי שורות ותאריכים בלי שנה', () => {
    expect(dates('חופשת חנוכה')).toBe('2026-12-04..2026-12-12')
    expect(dates('תענית אסתר וחופשת פורים')).toBe('2027-03-22..2027-03-24')
    expect(dates('חופשת פסח')).toBe('2027-04-14..2027-04-29')
    expect(dates('חופשת חג השבועות')).toBe('2027-06-10..2027-06-12')
    expect(cal.items.filter((i) => i.kind === 'break' && i.from).map((i) => i.title)).toEqual([
      'חופשת חנוכה',
      "תקופת בחינות סמסטר א'",
      'תענית אסתר וחופשת פורים',
      'חופשת פסח',
      'חופשת חג השבועות',
      "תקופת בחינות סמסטר ב'",
    ])
  })

  it('תאריכי הסמסטרים, ותקופת בחינות ביניהם', () => {
    const sem = Object.fromEntries(cal.items.filter((i) => i.semester).map((i) => [`${i.semester!.key}.${i.semester!.edge}`, i.from]))
    expect(sem).toEqual({ 'a.from': '2026-10-11', 'a.to': '2027-01-21', 'b.from': '2027-02-07', 'b.to': '2027-06-09' })
    expect(dates("תקופת בחינות סמסטר א'")).toBe('2027-01-22..2027-02-06')
    // לסמסטר ב' אין בקובץ תאריך סיום: עד התאריך האחרון שמופיע בו
    expect(dates("תקופת בחינות סמסטר ב'")).toBe('2027-06-10..2027-07-09')
    expect(item("תקופת בחינות סמסטר ב'").note).toContain('אין תאריך סיום')
  })

  it('"מבחן סוף סמסטר" הוא מבחן, לא סוף הסמסטר', () => {
    expect(item("מבחן סוף סמסטר א' באנגלית")).toMatchObject({ kind: 'exam', from: '2027-01-25' })
    expect(item("מבחן סוף סמסטר א' פיזיקה / כימיה")).toMatchObject({ kind: 'exam', from: '2027-01-28' })
    expect(item("מבחן סוף סמס' א' במתמ'")).toMatchObject({ kind: 'exam', from: '2027-02-04' })
  })

  it('טעות הקלדה בקובץ: התאריך העברי ויום השבוע מכריעים', () => {
    // בקובץ: "ימים שני-שלישי, כ"ו-כ"ז ניסן 3-4.4.26". ניסן תשפ"ז יוצא במאי 2027
    expect(item('ערב יום השואה')).toMatchObject({ from: '2027-05-03' })
    expect(item('יום השואה')).toMatchObject({ from: '2027-05-04' })
    expect(item('יום השואה').warning).toContain('3-4.4.26')
    // בקובץ: "יום שני, ה' באדר א' 15.2". ה' באדר א' הוא 12.2, אבל יום שני הוא 15.2
    expect(item("מועד ב' בפיסיקה")).toMatchObject({ from: '2027-02-15' })
    expect(item("מועד ב' בפיסיקה").warning).toBeUndefined()
  })

  it('כמה ימים בשורה אחת: אירוע לכל יום, עם השם שלו', () => {
    expect(item('ערב יום הזיכרון לחללי צה"ל').from).toBe('2027-05-10')
    expect(item('יום הזיכרון לחללי צה"ל').from).toBe('2027-05-11')
    expect(item('יום העצמאות').from).toBe('2027-05-12')
    expect(item('ערב יום ירושלים').from).toBe('2027-06-03')
    expect(item('יום ירושלים').from).toBe('2027-06-04')
  })

  it('שורות בלי תאריך נשארות ברשימה, בלי תאריך', () => {
    const undated = cal.items.filter((i) => !i.from).map((i) => i.title)
    expect(undated).toContain('מבחן תיל')
    expect(undated).toContain("מבחן סוף סמס' א' בכתיבה אקדמית")
    expect(undated).toContain("מועד ב' למבחן סוף סמס' ב' במתמ'")
    expect(undated).toHaveLength(12)
  })

  it('רק תאריך עברי: מחושב, עם אזהרה', () => {
    expect(item('מסיבת פורים')).toMatchObject({ from: '2027-03-10' })
    expect(item('מסיבת פורים').warning).toContain('אין תאריך לועזי')
  })

  it('שורות של תוכנית אחרת או של השנה הבאה מסומנות', () => {
    expect(cal.items.filter((i) => i.foreign).map((i) => i.title)).toEqual([
      'פתיחת מכינת סיעוד',
      'כנס פתיחת שנה - מכינה תשפ"ח',
      'תחילת לימודים קדם מכינה לתשפ"ח',
    ])
    expect(item('טקס סיום מכינה תשפ"ז ופרסים למצטיינים').foreign).toBeUndefined()
  })

  it('אותה שורה פעמיים מקבלת מזהים שונים', () => {
    const zoom = cal.items.filter((i) => i.title === 'לימודים ב"זום"')
    expect(zoom.map((i) => i.from)).toEqual(['2027-03-21', '2027-03-25'])
    expect(new Set(cal.items.map((i) => i.key)).size).toBe(cal.items.length)
  })
})

describe('שיוך מבחן למקצוע', () => {
  const mine = ['מתמטיקה', 'פיזיקה', 'אנגלית', 'כתיבה מדעית']
  it('קיצורים, תחיליות וכתיב שונה', () => {
    expect(matchSubject("מבחן סוף סמס' א' במתמ'", mine)).toEqual({ subject: 'מתמטיקה' })
    expect(matchSubject("מועד ב' בפיסיקה", mine)).toEqual({ subject: 'פיזיקה' })
    expect(matchSubject("מבחן סוף סמסטר א' פיזיקה / כימיה", mine)).toEqual({ subject: 'פיזיקה' })
    expect(matchSubject("מבחן סוף סמס' ב' באנגלית של המכינה", mine)).toEqual({ subject: 'אנגלית' })
  })
  it('דמיון חלקי הוא ניחוש', () => {
    expect(matchSubject("מועד ב' בכתיבה אקדמית", mine)).toEqual({ subject: 'כתיבה מדעית', guess: true })
  })
  it('מקצוע שלא שלי לא משויך', () => {
    expect(matchSubject("מבחן סוף סמס' ב' מבוא לניהול", mine)).toBeUndefined()
    expect(matchSubject('מבחן תיל', mine)).toBeUndefined()
  })
})

describe('ייבוא הלוח השנתי אל המערכת של יוחאי', () => {
  const checked = (plan: ReturnType<typeof planCalendarImport>) => plan.choices.filter((c) => c.checked).map((c) => c.item.title)

  it('מסמן מראש את מה ששייך לי', () => {
    const plan = planCalendarImport(initialData, cal)
    const on = checked(plan)
    expect(on).toContain('חופשת חנוכה')
    expect(on).toContain("מבחן סוף סמס' א' במתמ'")
    expect(on).toContain("מבחן סוף סמסטר א' פיזיקה / כימיה")
    expect(on).toContain('יום העצמאות')
    // לא שלי: מקצוע אחר, קבוצות של מרצים אחרים, תוכנית אחרת
    expect(on).not.toContain("מבחן סוף סמס' ב' מבוא לניהול")
    expect(on).not.toContain('בחינה סופית במתמטיקה - לקבוצה של שלמה הדד , ישראל קמיל ושלמה דיין')
    expect(on).not.toContain('פתיחת מכינת סיעוד')
    const group = plan.choices.find((c) => c.item.title.includes('שלמה הדד'))!
    expect(group.reason).toContain('רונן שחק')
    expect(plan.gone).toEqual([])
  })

  it('אחרי הייבוא: חופשות, סמסטרים, מבחנים כאירועי יום שלם עם מקצוע', () => {
    const next = applyCalendarImport(initialData, planCalendarImport(initialData, cal).choices)
    expect(next.breaks?.map((b) => `${b.title} ${b.from}`)).toContain('חופשת חנוכה 2026-12-04')
    expect(next.semesters).toMatchObject({ a: { from: '2026-10-11', to: '2027-01-21' }, b: { from: '2027-02-07', to: '2027-06-09' } })
    const math = next.events.find((e) => e.title === "מבחן סוף סמס' א' במתמ'")!
    expect(math).toMatchObject({ date: '2027-02-04', allDay: true, examSubject: 'מתמטיקה' })
    // המערכת עצמה לא נגעה
    expect(next.lessons).toBe(initialData.lessons)
    expect(next.entries).toBe(initialData.entries)
  })

  it('אירוע של יום שלם מופיע מעל היום, לא תופס זמן, ומבחן מגביר את התרגול', () => {
    const next = applyCalendarImport(initialData, planCalendarImport(initialData, cal).choices)
    expect(dayLabels(next, '2027-05-12')).toEqual(['יום העצמאות'])
    expect(dayLabels(next, '2027-01-28')).toEqual(["תקופת בחינות סמסטר א'", "מבחן סוף סמסטר א' פיזיקה / כימיה"])
    const week = startOfWeek(new Date(2027, 4, 12))
    const plan = planWeek(next, week, '2027-05-09', 0)
    expect(buildBlocks(next, { weekStart: week, plan: plan.sessions, reserved: plan.reserved }).some((b) => b.name === 'יום העצמאות')).toBe(false)
    // שבוע לפני המבחן בפיזיקה
    const before = planWeek(next, startOfWeek(new Date(2027, 0, 18)), '2027-01-17', 0)
    expect(before.report.find((r) => r.name.includes('פיזיקה'))?.boost).toBe('לקראת המבחן ב-28.1.2027')
  })

  it('העלאה חוזרת של אותו קובץ: אין מה לעדכן, ואין כפילויות', () => {
    const once = applyCalendarImport(initialData, planCalendarImport(initialData, cal).choices)
    const again = planCalendarImport(once, cal)
    expect(checked(again)).toEqual([])
    expect(again.choices.filter((c) => c.status === 'changed')).toEqual([])
    const twice = applyCalendarImport(once, again.choices)
    expect(twice.events).toHaveLength(once.events.length)
    expect(twice.breaks).toHaveLength(once.breaks!.length)
  })

  it('גרסה מעודכנת: תאריך שזז מתעדכן, שורה שקיבלה תאריך מתווספת, שעה שנקבעה ידנית נשמרת', () => {
    const once = applyCalendarImport(initialData, planCalendarImport(initialData, cal).choices)
    // קבעתי שעה למבחן במתמטיקה
    const withTime = {
      ...once,
      events: once.events.map((e) => (e.examSubject === 'מתמטיקה' ? { ...e, allDay: undefined, start: 10 * 60, end: 13 * 60 } : e)),
    }
    const updated: YearCalendar = {
      ...cal,
      items: cal.items.map((i) =>
        i.title === 'חופשת חנוכה'
          ? { ...i, to: '2026-12-13' }
          : i.title === "מבחן סוף סמס' א' במתמ'"
            ? { ...i, from: '2027-02-05', to: '2027-02-05' }
            : i.title === 'יום העצמאות'
              ? { ...i, title: 'יום העצמאות - חופשה', key: 'break:יוםהעצמאותחופשה', kind: 'break' as const }
              : i.title === "מועד ב' למבחן סוף סמס' ב' בפיסיקה"
                ? { ...i, from: '2027-07-01', to: '2027-07-01' }
                : i,
      ),
    }
    const plan = planCalendarImport(withTime, updated)
    const status = (title: string) => plan.choices.find((c) => c.item.title === title)!
    expect(status('חופשת חנוכה')).toMatchObject({ status: 'changed', checked: true, was: { from: '2026-12-04', to: '2026-12-12' } })
    expect(status("מבחן סוף סמס' א' במתמ'")).toMatchObject({ status: 'changed', checked: true })
    expect(status("מועד ב' למבחן סוף סמס' ב' בפיסיקה")).toMatchObject({ status: 'new', checked: true, subject: 'פיזיקה' })
    expect(status('יום העצמאות - חופשה')).toMatchObject({ status: 'new', checked: true })
    // השורה הישנה של יום העצמאות כבר לא בקובץ: מוצעת להסרה
    expect(plan.gone.map((g) => g.title)).toEqual(['יום העצמאות'])

    const next = applyCalendarImport(withTime, plan.choices, plan.gone)
    expect(next.breaks!.find((b) => b.title === 'חופשת חנוכה')).toMatchObject({ from: '2026-12-04', to: '2026-12-13' })
    expect(next.events.find((e) => e.examSubject === 'מתמטיקה')).toMatchObject({ date: '2027-02-05', start: 10 * 60, end: 13 * 60 })
    expect(next.events.find((e) => e.examSubject === 'מתמטיקה')!.allDay).toBeUndefined()
    expect(next.events.some((e) => e.title === 'יום העצמאות')).toBe(false)
    expect(next.breaks!.some((b) => b.title === 'יום העצמאות - חופשה' && b.from === '2027-05-12')).toBe(true)
    expect(next.events.filter((e) => e.title === 'חופשת חנוכה')).toEqual([])
    expect(next.breaks!.filter((b) => b.title === 'חופשת חנוכה')).toHaveLength(1)
  })

  it('חופשה שהוזנה ידנית קודם לא מוכפלת', () => {
    const manual = { ...initialData, breaks: [{ id: 'br1', title: 'חנוכה', from: '2026-12-04', to: '2026-12-12' }] }
    const plan = planCalendarImport(manual, cal)
    expect(plan.choices.find((c) => c.item.title === 'חופשת חנוכה')).toMatchObject({ status: 'same', checked: false })
    expect(applyCalendarImport(manual, plan.choices).breaks!.filter((b) => b.from === '2026-12-04')).toHaveLength(1)
  })
})
