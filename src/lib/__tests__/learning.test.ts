import { describe, expect, it } from 'vitest'
import { initialData } from '../../data/initial'
import { planWeek } from '../plan'
import { blocksOf, logReview, logSession, nextReview, unlogSession } from '../learning'
import type { Goal, Review, ScheduleData } from '../../types'

// שבוע שמתחיל ביום ראשון 15.11.2026
const WEEK = new Date(2026, 10, 15)

const goal = (g: Partial<Goal> & { id: string; name: string }): Goal => ({
  color: 'teal',
  minHoursPerWeek: 3,
  maxHoursPerWeek: 3,
  preferredWindows: [],
  ...g,
})

const vocab = goal({ id: 'voc', name: 'אוצר מילים', kind: 'knowledge', minHoursPerWeek: 2, maxHoursPerWeek: 2 })
const withGoals = (...goals: Goal[]): ScheduleData => ({ ...initialData, goals, log: [], reviews: [] })

describe('חזרות מרווחות', () => {
  const r: Review = { id: 'r', goalId: 'voc', topic: 'פעלים', due: '2026-11-16', step: 1 }

  it('מתאים מתקדם שלב, קל מדלג, קשה חוזר אחורה', () => {
    expect(nextReview(r, 'ok', '2026-11-16')).toMatchObject({ step: 2, due: '2026-11-23' })
    expect(nextReview(r, 'easy', '2026-11-16')).toMatchObject({ step: 3, due: '2026-11-30' })
    expect(nextReview(r, 'hard', '2026-11-16')).toMatchObject({ step: 0, due: '2026-11-17' })
  })

  it('אחרי החזרה האחרונה השרשרת נגמרת', () => {
    expect(nextReview({ ...r, step: 4 }, 'ok', '2026-11-16')).toBeNull()
  })

  it('נושא ביעד ידע יוצר חזרה למחר, וביטול הסימון מוחק אותה', () => {
    const data = logSession(withGoals(vocab), { goalId: 'voc', start: 600, end: 630 }, '2026-11-15', { topic: 'פעלים' })
    expect(data.reviews).toHaveLength(1)
    expect(data.reviews![0]).toMatchObject({ topic: 'פעלים', due: '2026-11-16', step: 0 })
    const back = unlogSession(data, data.log![0].id)
    expect(back.reviews).toHaveLength(0)
    expect(back.log).toHaveLength(0)
  })

  it('יעד שאינו ידע לא יוצר חזרות', () => {
    const skill = { ...vocab, kind: 'skill' as const }
    const data = logSession(withGoals(skill), { goalId: 'voc', start: 600, end: 630 }, '2026-11-15', { topic: 'סולמות' })
    expect(data.reviews).toHaveLength(0)
  })

  it('סימון חזרה מקדם אותה, וביטול מחזיר', () => {
    const data = { ...withGoals(vocab), reviews: [r] }
    const done = logReview(data, r, { start: 600, end: 620 }, '2026-11-16', { rating: 'ok' })
    expect(done.reviews![0]).toMatchObject({ id: 'r', step: 2, due: '2026-11-23' })
    expect(done.log![0]).toMatchObject({ reviewId: 'r', topic: 'פעלים' })
    expect(unlogSession(done, done.log![0].id).reviews).toEqual([r])
  })

  it('התכנון שם חזרה ביום שלה, עם הסבר', () => {
    const data = { ...withGoals(vocab), reviews: [{ ...r, due: '2026-11-17' }] }
    const s = planWeek(data, WEEK).sessions.find((x) => x.reviewId === 'r')!
    expect(s.day).toBe(2)
    expect(s.end - s.start).toBe(20)
    expect(s.title).toBe('חזרה: פעלים')
    expect(s.reasons.join(' ')).toContain('חזרה מרווחת')
  })

  it('חזרה שעבר זמנה נדחית להיום ולא נעלמת', () => {
    const data = { ...withGoals(vocab), reviews: [{ ...r, due: '2026-11-10' }] }
    const s = planWeek(data, WEEK, '2026-11-18').sessions.find((x) => x.reviewId === 'r')!
    expect(s.day).toBeGreaterThanOrEqual(3)
    expect(s.reasons.some((x) => x.includes('נדחתה'))).toBe(true)
    // בשבוע שכבר עבר היא לא מופיעה
    expect(planWeek(data, new Date(2026, 10, 8), '2026-11-18').sessions.some((x) => x.reviewId)).toBe(false)
  })

  it('חזרה שבוצעה לא מתוכננת שוב באותו שבוע', () => {
    const data = { ...withGoals(vocab), reviews: [r] }
    const done = logReview(data, r, { start: 600, end: 620 }, '2026-11-16', { rating: 'hard' })
    const sessions = planWeek(done, WEEK).sessions.filter((x) => x.reviewId === 'r')
    // אחת בוצעה ב-16, והבאה (קשה = מחר) מתוכננת ל-17
    expect(sessions.filter((x) => x.done)).toHaveLength(1)
    expect(sessions.filter((x) => !x.done).map((x) => x.day)).toEqual([2])
  })
})

describe('כללים לפי סוג הלמידה', () => {
  it('מיומנות: מפגשים של 45 דקות, ולא יותר משעה וחצי ביום', () => {
    const g = goal({ id: 'gtr', name: 'גיטרה', kind: 'skill', minHoursPerWeek: 6, maxHoursPerWeek: 6, maxPerDay: 3 })
    const plan = planWeek(withGoals(g), WEEK)
    const mine = plan.sessions.filter((s) => s.goalId === 'gtr')
    expect(mine.every((s) => s.end - s.start === 45)).toBe(true)
    for (let d = 0; d < 7; d++) {
      expect(mine.filter((s) => s.day === d).reduce((m, s) => m + s.end - s.start, 0)).toBeLessThanOrEqual(90)
    }
  })

  it('יצירה: מפגשים ארוכים, אחד ביום', () => {
    const g = goal({ id: 'book', name: 'כתיבה', kind: 'creative', minHoursPerWeek: 4.5, maxHoursPerWeek: 4.5 })
    const mine = planWeek(withGoals(g), WEEK).sessions.filter((s) => s.goalId === 'book')
    expect(mine.every((s) => s.end - s.start === 90)).toBe(true)
    expect(new Set(mine.map((s) => s.day)).size).toBe(mine.length)
  })

  it('לא שני מפגשים צמודים של אותו יעד', () => {
    const g = goal({ ...vocab, minHoursPerWeek: 5, maxHoursPerWeek: 5 })
    const mine = planWeek(withGoals(g), WEEK).sessions.filter((s) => s.goalId === 'voc')
    for (const a of mine) for (const b of mine) if (a !== b && a.day === b.day) expect(b.start - a.end === 15).toBe(false)
  })

  it('שעות חדות: למידה מושמת בהן כשיש מקום', () => {
    const data = { ...withGoals(vocab), plan: { ...{ dayStart: 480, dayEnd: 1380, breakMinutes: 15, fridayEnd: 720, offDays: [6] as const, maxHoursPerDay: 4 }, offDays: [6 as const], sharpFrom: 9 * 60, sharpTo: 12 * 60 } }
    const mine = planWeek(data, WEEK).sessions.filter((s) => s.goalId === 'voc')
    expect(mine.length).toBeGreaterThan(0)
    expect(mine.every((s) => s.start >= 540 && s.end <= 720)).toBe(true)
    expect(mine[0].reasons.some((r) => r.includes('חד'))).toBe(true)
  })

  it('מפגש ארוך מתחלק לבלוקים עם הפסקות', () => {
    expect(blocksOf('skill', 45)).toBeNull()
    expect(blocksOf('skill', 90)).toEqual({ count: 2, each: 40, rest: 10 })
    expect(blocksOf('creative', 120)).toBeNull()
    expect(blocksOf(undefined, 120)).toBeNull()
  })
})
