import { describe, expect, it } from 'vitest'
import { initialData } from '../../data/initial'
import { activeOn, planWeek } from '../plan'
import { buildBlocks } from '../layout'
import { MAX_REVIEWS_PER_DAY } from '../learning'
import { lessonsOfSemester, semesterFromNote, semesterOf, setSemesterDates, validRange } from '../semester'
import type { Goal, Lesson, Review, ScheduleData } from '../../types'

const lesson = (l: Partial<Lesson>): Lesson => ({ id: 'x', name: 'כתיבה מדעית', color: 'teal', ...l })

describe('סמסטר מההערה בקובץ', () => {
  it('מזהה סמסטר א׳, ב׳ וקיץ', () => {
    expect(semesterFromNote("קורס סמסטר א' בלבד")).toBe('a')
    expect(semesterFromNote('סמסטר ב׳ בלבד')).toBe('b')
    expect(semesterFromNote('סמסטר קיץ')).toBe('summer')
    expect(semesterFromNote('אחת לשבועיים')).toBeUndefined()
    expect(semesterFromNote('סמסטר אחד')).toBeUndefined()
  })

  it('"כל השנה" גובר על ההערה, ובחירה ידנית גוברת עליה', () => {
    expect(semesterOf(lesson({ note: "סמסטר א' בלבד", semester: 'all' }))).toBeUndefined()
    expect(semesterOf(lesson({ note: "סמסטר א' בלבד", semester: 'b' }))).toBe('b')
  })
})

describe('תוקף לפי תאריכי הסמסטר', () => {
  const semesters = { a: { from: '2026-10-18', to: '2027-01-29' } }
  const a = lesson({ note: "קורס סמסטר א' בלבד" })

  it('שיעור של סמסטר א׳ קיים רק בתאריכי הסמסטר', () => {
    expect(activeOn(a, '2026-11-15', semesters)).toBe(true)
    expect(activeOn(a, '2027-02-01', semesters)).toBe(false)
    // בלי תאריכים לסמסטר: כל השנה, כמו קודם
    expect(activeOn(a, '2027-02-01')).toBe(true)
  })

  it('תאריכים של השיעור עצמו גוברים על הסמסטר', () => {
    const own = { ...a, validUntil: '2027-03-01' }
    expect(validRange(own, semesters)).toEqual({ from: undefined, to: '2027-03-01' })
    expect(activeOn(own, '2027-02-01', semesters)).toBe(true)
  })

  it('שמירת תאריכים פעם אחת חלה על כל השיעורים של הסמסטר, וטווח ריק מוחק', () => {
    const data: ScheduleData = { ...initialData, lessons: [a, lesson({ id: 'y', name: 'מבוא', note: "סמסטר א'" }), lesson({ id: 'z' })] }
    expect(lessonsOfSemester(data, 'a').map((l) => l.id)).toEqual(['x', 'y'])
    const set = setSemesterDates(data, 'a', semesters.a)
    expect(set.semesters?.a).toEqual(semesters.a)
    expect(setSemesterDates(set, 'a', {}).semesters?.a).toBeUndefined()
  })

  it('בלוח: שיעור של סמסטר שנגמר לא מוצג בשבוע שאחרי', () => {
    const entry = initialData.entries[0]
    const l = initialData.lessons.find((x) => x.id === entry.lessonId)!
    const base: ScheduleData = { ...initialData, lessons: initialData.lessons.map((x) => (x.id === l.id ? { ...x, semester: 'a' as const } : x)) }
    const ended = { ...base, semesters: { a: { from: '2026-10-01', to: '2026-11-01' } } }
    const week = new Date(2026, 10, 15)
    const has = (d: ScheduleData) => buildBlocks(d, { weekStart: week }).some((b) => b.id === entry.id)
    expect(has(base)).toBe(true)
    expect(has(ended)).toBe(false)
  })
})

describe('תקרה לחזרות ביום', () => {
  const WEEK = new Date(2026, 10, 15)
  const vocab: Goal = {
    id: 'voc', name: 'אוצר מילים', kind: 'knowledge', color: 'teal',
    minHoursPerWeek: 1, maxHoursPerWeek: 1, preferredWindows: [],
  }
  const reviews: Review[] = Array.from({ length: MAX_REVIEWS_PER_DAY + 2 }, (_, i) => ({
    id: `r${i}`, goalId: 'voc', topic: `נושא ${i}`, due: '2026-11-17', step: 0,
  }))

  it('יותר מהתקרה באותו יום עוברות ליום הבא, עם הסבר', () => {
    const data: ScheduleData = { ...initialData, goals: [vocab], log: [], reviews }
    const rs = planWeek(data, WEEK).sessions.filter((x) => x.reviewId)
    expect(rs).toHaveLength(reviews.length)
    const perDay = new Map<number, number>()
    for (const x of rs) perDay.set(x.day, (perDay.get(x.day) ?? 0) + 1)
    for (const n of perDay.values()) expect(n).toBeLessThanOrEqual(MAX_REVIEWS_PER_DAY)
    expect(perDay.get(2)).toBe(MAX_REVIEWS_PER_DAY)
    const late = rs.filter((x) => x.day > 2)
    expect(late).toHaveLength(2)
    expect(late[0].reasons.join(' ')).toContain(`כבר היו שם ${MAX_REVIEWS_PER_DAY} חזרות`)
  })
})

describe('השבוע שהאתר נפתח עליו', () => {
  it('במוצאי שבת: השבוע הבא, מיום ראשון', async () => {
    const { activeWeek } = await import('../plan')
    const r = activeWeek(initialData, new Date(2026, 10, 14, 21, 0))
    expect(r.weekStart.getDate()).toBe(15)
    expect(r.day).toBe(0)
  })
  it('ביום חמישי: השבוע הנוכחי והיום', async () => {
    const { activeWeek } = await import('../plan')
    const r = activeWeek(initialData, new Date(2026, 10, 12, 21, 0))
    expect(r.weekStart.getDate()).toBe(8)
    expect(r.day).toBe(4)
  })
  it('בשישי אחרי שעת הסיום: השבוע הבא', async () => {
    const { activeWeek } = await import('../plan')
    expect(activeWeek(initialData, new Date(2026, 10, 13, 14, 0)).weekStart.getDate()).toBe(15)
  })
})
