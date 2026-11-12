import { describe, expect, it } from 'vitest'
import { initialData } from '../../data/initial'
import { DEFAULT_PLAN, busyForWeek, freeTime, planWeek } from '../plan'
import type { Goal, ScheduleData } from '../../types'

// שבוע שמתחיל ביום ראשון 15.11.2026
const WEEK = new Date(2026, 10, 15)

const goal = (g: Partial<Goal> & { id: string; name: string }): Goal => ({
  color: 'teal',
  minHoursPerWeek: 3,
  maxHoursPerWeek: 3,
  preferredWindows: [],
  ...g,
})

const overlaps = (a: { day: number; start: number; end: number }, b: { day: number; start: number; end: number }) =>
  a.day === b.day && a.start < b.end && b.start < a.end

describe('זמן פנוי', () => {
  it('בלי שבת, שישי עד הצהריים, והפסקה סביב כל שיעור', () => {
    const free = freeTime(initialData, WEEK)
    expect(free[6]).toEqual([])
    expect(Math.max(...free[5].map((f) => f.end))).toBe(12 * 60)
    // ראשון: השיעור הראשון ב-13:30, אז הזמן הפנוי בבוקר נגמר ב-13:15
    expect(free[0][0]).toEqual({ start: 8 * 60, end: 13 * 60 + 15 })
  })

  it('שיעור שבוטל בשבוע הזה משחרר את הזמן שלו', () => {
    const e = initialData.entries.find((x) => x.lessonId === 'math' && x.slot.day === 4)!
    const data: ScheduleData = { ...initialData, cancellations: [{ id: 'c1', date: '2026-11-19', refId: e.id }] }
    expect(busyForWeek(data, WEEK).some((b) => b.day === 4 && b.start === e.slot.start)).toBe(false)
    expect(busyForWeek(data, new Date(2026, 10, 22)).some((b) => b.day === 4 && b.start === e.slot.start)).toBe(true)
  })

  it('אירוע חד-פעמי תופס זמן רק בשבוע שלו', () => {
    const data: ScheduleData = {
      ...initialData,
      events: [{ id: 'w', date: '2026-11-18', start: 20 * 60 + 30, end: 23 * 60, title: 'חתונה' }],
    }
    expect(busyForWeek(data, WEEK).filter((b) => b.kind === 'event')).toHaveLength(1)
    expect(busyForWeek(data, new Date(2026, 10, 22)).filter((b) => b.kind === 'event')).toHaveLength(0)
  })
})

describe('planWeek', () => {
  const data: ScheduleData = {
    ...initialData,
    goals: [
      goal({ id: 'phys', name: 'תרגול פיזיקה', subject: 'פיזיקה', minHoursPerWeek: 4, maxHoursPerWeek: 5 }),
      goal({ id: 'gym', name: 'אימון', minHoursPerWeek: 3, maxHoursPerWeek: 3 }),
    ],
  }
  const plan = planWeek(data, WEEK)

  it('ממלא את המינימום של כל יעד', () => {
    for (const r of plan.report) expect(r.planned).toBeGreaterThanOrEqual(r.min)
  })

  it('לא מתנגש בשום שיעור, לא בשבת, ושומר הפסקה', () => {
    const busy = busyForWeek(data, WEEK)
    for (const s of plan.sessions) {
      expect(s.day).not.toBe(6)
      for (const b of busy) expect(overlaps({ ...s, start: s.start - 15, end: s.end + 15 }, b)).toBe(false)
      for (const o of plan.sessions) if (o !== s) expect(overlaps(s, o)).toBe(false)
    }
  })

  it('מפזר: לכל היותר מפגש אחד של כל יעד ביום', () => {
    for (const id of ['phys', 'gym']) {
      const days = plan.sessions.filter((s) => s.goalId === id).map((s) => s.day)
      expect(new Set(days).size).toBe(days.length)
    }
  })

  it('תרגול פיזיקה נקבע ליד שיעורי פיזיקה, עם הסבר', () => {
    const phys = plan.sessions.filter((s) => s.goalId === 'phys')
    expect(phys.every((s) => s.reasons.some((r) => r.includes('פיזיקה')))).toBe(true)
  })

  it('יעד שמעדיף חלונות תרגול נכנס לחלונות של מיגו', () => {
    const p = planWeek({ ...initialData, goals: [goal({ id: 'm', name: 'מתמטיקה', preferPractice: true })] }, WEEK)
    expect(p.sessions.length).toBe(3)
    expect(p.sessions.every((s) => s.reasons.some((r) => r.includes('מיגו')))).toBe(true)
  })

  it('מדווח כשאין מספיק זמן', () => {
    const p = planWeek({ ...initialData, goals: [goal({ id: 'x', name: 'הרבה', minHoursPerWeek: 60, maxHoursPerWeek: 60 })] }, WEEK)
    expect(p.report[0].planned).toBeLessThan(p.report[0].min)
  })

  it('תמיד אותה תוצאה לאותו שבוע', () => {
    expect(planWeek(data, WEEK)).toEqual(plan)
  })
})

describe('חגים ותרגול שבוצע', () => {
  it('ביום חג אין שיעורים ואין תכנון, ובערב חג היום נגמר מוקדם', () => {
    // שבוע ראש השנה ויום כיפור תשפ"ז: ראשון 20.9.2026 ערב יום כיפור, שני 21.9 יום כיפור
    const week = new Date(2026, 8, 20)
    const busy = busyForWeek(initialData, week)
    expect(busy.some((b) => b.day === 1)).toBe(false)
    const free = freeTime(initialData, week)
    expect(free[1]).toEqual([])
    expect(Math.max(...free[0].map((f) => f.end))).toBeLessThanOrEqual(12 * 60)
  })

  it('מפגש שסומן כבוצע נשאר במקומו ונספר', () => {
    const g = goal({ id: 'g', name: 'קריאה', minHoursPerWeek: 2, maxHoursPerWeek: 2 })
    const data: ScheduleData = {
      ...initialData,
      goals: [g],
      log: [{ id: 'd1', goalId: 'g', date: '2026-11-20', start: 9 * 60, end: 10 * 60 }],
    }
    const p = planWeek(data, WEEK)
    expect(p.sessions.find((s) => s.done)).toMatchObject({ day: 5, start: 540 })
    expect(p.report[0]).toMatchObject({ planned: 120, done: 60 })
  })
})

describe('יעד בימים ובשעות מסוימים', () => {
  it('אימון רק בבוקר, רק בראשון שלישי וחמישי', () => {
    const g = goal({ id: 'gym', name: 'אימון', minHoursPerWeek: 3, maxHoursPerWeek: 3, days: [0, 2, 4], earliest: 7 * 60, latest: 10 * 60 })
    const p = planWeek({ ...initialData, plan: { ...DEFAULT_PLAN, dayStart: 6 * 60 }, goals: [g] }, WEEK)
    expect(p.sessions.map((s) => s.day)).toEqual([0, 2, 4])
    expect(p.sessions.every((s) => s.start >= 420 && s.end <= 600)).toBe(true)
  })
})
