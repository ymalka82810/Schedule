import { describe, expect, it } from 'vitest'
import { emptyData } from '../../data/empty'
import { DEFAULT_PLAN, deadlineTarget, planWeek, weekFrame } from '../plan'
import { zmanimOn } from '../routines'
import type { Goal, Lesson, PlanSettings, ScheduleData } from '../../types'

// שבוע שמתחיל ביום ראשון 15.11.2026
const WEEK = new Date(2026, 10, 15)
const h = (x: number) => x * 60

const goal = (g: Partial<Goal> & { id: string; name: string }): Goal => ({
  color: 'teal',
  minHoursPerWeek: 2,
  maxHoursPerWeek: 2,
  preferredWindows: [],
  ...g,
})

const lesson = (id: string, name: string): Lesson => ({ id, name, color: 'cobalt' })

/** מערכת עם שיעורי פיזיקה בראשון ושלישי 10:00-14:00 */
const base = (plan: Partial<PlanSettings> = {}, extra: Partial<ScheduleData> = {}): ScheduleData => ({
  ...emptyData,
  lessons: [lesson('ph', 'פיזיקה')],
  entries: [
    { id: 'e1', lessonId: 'ph', slot: { day: 0, start: h(10), end: h(14) } },
    { id: 'e2', lessonId: 'ph', slot: { day: 2, start: h(10), end: h(14) } },
  ],
  plan: { ...DEFAULT_PLAN, ...plan },
  ...extra,
})

const overlap = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.end

describe('נסיעה', () => {
  it('נשמרת לפני השיעור הראשון ואחרי האחרון, רק בימים עם שיעורים', () => {
    const { free, reserved } = weekFrame(base({ travelMinutes: 30 }), WEEK)
    const travel = reserved.filter((r) => r.kind === 'travel')
    expect(travel.map((r) => [r.day, r.start, r.end])).toEqual([
      [0, h(9.5), h(10)],
      [0, h(14), h(14.5)],
      [2, h(9.5), h(10)],
      [2, h(14), h(14.5)],
    ])
    // נסיעה ועוד הפסקה: הזמן הפנוי מתחיל רבע שעה אחרי ההגעה הביתה
    expect(free[0].some((f) => f.start === h(14.75))).toBe(true)
    expect(free[1]).toEqual([{ start: DEFAULT_PLAN.dayStart, end: DEFAULT_PLAN.dayEnd }])
  })
})

describe('שגרות', () => {
  const lunch = { id: 'l', name: 'צהריים', days: [0, 1] as const, from: { at: h(12) }, to: { at: h(15) }, minutes: 30 }

  it('ארוחה נכנסת לחלון, צמוד לסוף השיעור, ולא משובץ שם תרגול', () => {
    const data = base({ routines: [{ ...lunch, days: [0, 1] }] }, { goals: [goal({ id: 'g', name: 'קריאה', minHoursPerWeek: 10, maxHoursPerWeek: 10 })] })
    const { reserved } = weekFrame(data, WEEK)
    const sun = reserved.find((r) => r.day === 0 && r.kind === 'routine')!
    expect([sun.start, sun.end]).toEqual([h(14), h(14.5)])
    const mon = reserved.find((r) => r.day === 1 && r.kind === 'routine')!
    expect(mon.start).toBe(h(12))
    const plan = planWeek(data, WEEK)
    for (const r of plan.reserved) expect(plan.sessions.some((s) => s.day === r.day && overlap(s, r))).toBe(false)
  })

  it('חלון שכולו תפוס בשיעור: השגרה לא נשמרת באותו יום', () => {
    const data = base({ routines: [{ ...lunch, days: [0], from: { at: h(11) }, to: { at: h(13) } }] })
    expect(weekFrame(data, WEEK).reserved).toEqual([])
  })

  it('מנחה לפי זמני היום: בין מנחה גדולה לשקיעה', () => {
    const data = base({
      routines: [{ id: 'm', name: 'מנחה', days: [1], from: { zman: 'minchaGedola', offset: 0 }, to: { zman: 'sunset', offset: 0 }, minutes: 20 }],
    })
    const z = zmanimOn('2026-11-16')!
    expect(z.sunset).toBeGreaterThan(h(16))
    expect(z.sunset).toBeLessThan(h(17))
    const r = weekFrame(data, WEEK).reserved[0]
    expect(r.day).toBe(1)
    expect(r.start).toBeGreaterThanOrEqual(z.minchaGedola)
    expect(r.end).toBeLessThanOrEqual(z.sunset)
  })
})

describe('עבר ופספוסים', () => {
  const data = base({}, { goals: [goal({ id: 'g', name: 'קריאה', minHoursPerWeek: 5, maxHoursPerWeek: 5, maxPerDay: 2 })] })

  it('לא מתכננים לימים שעברו ולא לפני עכשיו, והיעד עדיין מגיע למינימום', () => {
    const p = planWeek(data, WEEK, '2026-11-17', h(15))
    const real = p.sessions.filter((s) => !s.missed)
    expect(real.every((s) => s.day > 2 || (s.day === 2 && s.start >= h(14.5)))).toBe(true)
    expect(p.report[0].planned).toBe(h(5))
  })

  it('מה שתוכנן לזמן שעבר ולא סומן מוצג כפספוס, ולא נספר', () => {
    const p = planWeek(data, WEEK, '2026-11-17', h(15))
    const missed = p.sessions.filter((s) => s.missed)
    expect(missed.length).toBeGreaterThan(0)
    expect(missed.every((s) => s.day <= 2)).toBe(true)
    expect(p.report[0].missed).toBe(missed.reduce((m, s) => m + s.end - s.start, 0))
  })

  it('מפגש שסומן בעבר נשאר, ואין פספוס במקומו', () => {
    const first = planWeek(data, WEEK).sessions[0]
    const logged = { ...data, log: [{ id: 'l1', goalId: 'g', date: '2026-11-15', start: first.start, end: first.end }] }
    const p = planWeek(logged, WEEK, '2026-11-17', h(15))
    expect(p.sessions.some((s) => s.done && s.day === 0)).toBe(true)
    expect(p.sessions.some((s) => s.missed && s.day === 0 && overlap(s, first))).toBe(false)
  })

  it('שבוע שעבר כולו: רק מה שבוצע', () => {
    expect(planWeek(data, WEEK, '2026-11-25').sessions.filter((s) => !s.missed)).toEqual([])
  })
})

describe('עומס יומי', () => {
  it('יום עם הרבה שיעורים מקבל פחות תרגול, ותקרה כוללת נשמרת', () => {
    const data = base({ maxLoadPerDay: 5, maxHoursPerDay: 4 }, { goals: [goal({ id: 'g', name: 'קריאה', minHoursPerWeek: 6, maxHoursPerWeek: 6, maxPerDay: 3 })] })
    const p = planWeek(data, WEEK)
    for (const day of [0, 2]) {
      const mins = p.sessions.filter((s) => s.day === day).reduce((m, s) => m + s.end - s.start, 0)
      expect(h(4) + mins).toBeLessThanOrEqual(h(5))
    }
  })
})

describe('התאמת מקצוע', () => {
  it('כתיב שונה ומשבצת בחירה שלא נבחרה עדיין נחשבים שיעור במקצוע', () => {
    const data: ScheduleData = {
      ...emptyData,
      lessons: [lesson('a', 'פיסיקה'), lesson('b', 'מבוא למחשבים')],
      entries: [],
      choiceGroups: [{ id: 'c', slot: { day: 3, start: h(10), end: h(12) }, optionLessonIds: ['a', 'b'], chosenLessonId: null }],
      plan: DEFAULT_PLAN,
      goals: [goal({ id: 'g', name: 'תרגול', subject: 'פיזיקה', minHoursPerWeek: 1, maxHoursPerWeek: 1 })],
    }
    const s = planWeek(data, WEEK).sessions[0]
    expect(s.reasons.join(' ')).toMatch(/פיזיקה/)
  })
})

describe('הזזת מפגשים כשיעד לא מגיע למינימום', () => {
  it('יעד גמיש מפנה את המקום היחיד שמתאים ליעד מוגבל', () => {
    // היעד הגמיש מעדיף בדיוק את השעה היחידה שבה היעד המוגבל יכול להיות
    const slot = { day: 1 as const, start: h(10), end: h(11) }
    const data: ScheduleData = {
      ...emptyData,
      plan: DEFAULT_PLAN,
      goals: [
        goal({ id: 'free', name: 'גמיש', minHoursPerWeek: 1, maxHoursPerWeek: 1, preferredWindows: [slot], days: [1] }),
        goal({ id: 'tight', name: 'מוגבל', minHoursPerWeek: 1, maxHoursPerWeek: 1, days: [1], earliest: h(10), latest: h(11) }),
      ],
    }
    const p = planWeek(data, WEEK)
    const tight = p.report.find((r) => r.goalId === 'tight')!
    const flex = p.report.find((r) => r.goalId === 'free')!
    expect(tight.planned).toBe(h(1))
    expect(flex.planned).toBe(h(1))
    expect(tight.rearranged).toBe(1)
    expect(p.sessions.find((s) => s.goalId === 'free')!.reasons.join(' ')).toMatch(/לפנות מקום/)
  })
})

describe('יעד עם תאריך יעד', () => {
  const g = goal({ id: 'p', name: 'פרויקט', totalHours: 12, deadline: '2026-11-26' })

  it('השעות מתחלקות שווה על ימי התכנון עד התאריך', () => {
    // 15-26.11: 11 ימי תכנון בלי שבת; 26.11 הוא יום ביטחון, כך שנשארים 10, 6 מהם השבוע. 12 * 6 / 10 = 7.2 => 7.25
    const t = deadlineTarget(base(), g, WEEK)
    expect(t.weekly).toBe(7.25)
    expect(t.buffer).toBe('2026-11-26')
    const p = planWeek(base({}, { goals: [g] }), WEEK)
    expect(p.report[0].min).toBe(h(7.5))
    expect(p.report[0].deadline).toMatchObject({ date: '2026-11-26', remainingHours: 12, passed: false })
  })

  it('מה שסומן לפני השבוע יורד מהסך, ואחרי התאריך היעד לא מתוכנן', () => {
    const logged = base({}, { goals: [g], log: [{ id: 'x', goalId: 'p', date: '2026-11-10', start: h(10), end: h(16) }] })
    expect(deadlineTarget(logged, g, WEEK).remaining).toBe(h(6))
    const after = planWeek(base({}, { goals: [g] }), new Date(2026, 10, 29))
    expect(after.sessions).toEqual([])
  })

  it('באמצע השבוע: מה שנשאר מתחלק מהיום והלאה', () => {
    // מיום שלישי: 17-25.11 = 8 ימי תכנון (בלי יום הביטחון), 4 מהם השבוע. 12 * 4 / 8 = 6
    expect(deadlineTarget(base(), g, WEEK, '2026-11-17').weekly).toBe(6)
  })

  it('בשבוע של התאריך לא מתכננים אחריו, ויום הביטחון נשאר פנוי כשיש מקום', () => {
    // בשבוע הקודם תרגלתי 9 שעות, נשארו 3 על 4 ימים
    const log = [{ id: 'x', goalId: 'p', date: '2026-11-18', start: h(9), end: h(18) }]
    const p = planWeek(base({}, { goals: [g], log }), new Date(2026, 10, 22))
    expect(p.report[0].planned).toBeGreaterThanOrEqual(h(3))
    expect(p.sessions.every((s) => s.day <= 3)).toBe(true)
  })

  it('תאריך קרוב (פחות מ-4 ימים): בלי יום ביטחון', () => {
    expect(deadlineTarget(base(), { ...g, deadline: '2026-11-17' }, WEEK).buffer).toBeUndefined()
  })
})

describe('סוג השיעור בתכנון', () => {
  it('לפני תרגול: לנסות לבד ולהגיע עם שאלות. אחרי הרצאה: לעבד באותו יום', () => {
    const data: ScheduleData = {
      ...emptyData,
      lessons: [lesson('ph', 'פיזיקה')],
      entries: [
        { id: 'lec', lessonId: 'ph', kind: 'הרצאה', slot: { day: 0, start: h(9), end: h(11) } },
        { id: 'tut', lessonId: 'ph', kind: 'תרגול', slot: { day: 2, start: h(9), end: h(10) } },
      ],
      plan: DEFAULT_PLAN,
      goals: [goal({ id: 'g', name: 'תרגול פיזיקה', subject: 'פיזיקה', minHoursPerWeek: 2, maxHoursPerWeek: 2 })],
    }
    const reasons = planWeek(data, WEEK).sessions.flatMap((s) => s.reasons).join(' | ')
    expect(reasons).toMatch(/לפני התרגול, ולהגיע עם שאלות/)
    expect(reasons).toMatch(/עיבוד של ההרצאה באותו יום/)
  })
})
