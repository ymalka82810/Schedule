import { describe, expect, it } from 'vitest'
import { initialData } from '../../data/initial'
import { buildBlocks, conflictsOf } from '../layout'
import { planWeek } from '../plan'
import { movePlanned } from '../prefs'
import { lastStuck } from '../learning'
import { snoozeVersionReminder, versionAge } from '../edit'
import { fromDotted } from '../time'
import type { ScheduleData } from '../../types'

const WEEK = new Date(2026, 10, 15)

describe('התנגשות בזמן גרירה', () => {
  const blocks = buildBlocks(initialData, { weekStart: WEEK })
  const lesson = blocks.find((b) => b.type === 'lesson')!

  it('הבלוק עצמו לא נחשב התנגשות', () => {
    expect(conflictsOf(blocks, { id: lesson.id, day: lesson.day, start: lesson.start, len: lesson.end - lesson.start })).toEqual([])
  })

  it('נחיתה על שיעור אחר מתנגשת, ועל זמן פנוי לא', () => {
    const other = blocks.find((b) => b.type === 'lesson' && b.id !== lesson.id && b.day !== lesson.day)!
    const hit = conflictsOf(blocks, { id: lesson.id, day: other.day, start: other.start, len: 30 })
    expect(hit.map((b) => b.id)).toContain(other.id)
    expect(conflictsOf(blocks, { id: lesson.id, day: 6, start: 10 * 60, len: 60 })).toEqual([])
  })

  it('חלון תרגול פתוח לא נחשב התנגשות', () => {
    const w = blocks.find((b) => b.type === 'practice')
    if (!w) return
    expect(conflictsOf(blocks, { id: 'x', day: w.day, start: w.start, len: 30 }).some((b) => b.id === w.id)).toBe(false)
  })
})

describe('שינוי אורך של מפגש מתוכנן', () => {
  const data: ScheduleData = {
    ...initialData,
    goals: [{ id: 'gym', name: 'אימון', color: 'coral', minHoursPerWeek: 2, maxHoursPerWeek: 2, preferredWindows: [] }],
  }
  const s = planWeek(data, WEEK).sessions[0]

  it('מאריך את המפגש במקומו, והזמן נספר ביעד', () => {
    const next = movePlanned(data, s, WEEK, s.day, s.start, s.end + 30)
    const p = planWeek(next, WEEK).sessions.find((x) => x.pinId)!
    expect(p).toMatchObject({ day: s.day, start: s.start, end: s.end + 30 })
  })

  it('החזרה לאורך ולמקום המקוריים מבטלת את ההצמדה', () => {
    const longer = movePlanned(data, s, WEEK, s.day, s.start, s.end + 30)
    const p = planWeek(longer, WEEK).sessions.find((x) => x.pinId)!
    const back = movePlanned(longer, p, WEEK, s.day, s.start, s.end)
    expect(back.planPins).toEqual([])
  })
})

describe('איפה נתקעתי', () => {
  const data: ScheduleData = {
    ...initialData,
    log: [
      { id: 'a', goalId: 'g', date: '2026-11-10', start: 600, end: 660, stuck: 'אינטגרלים' },
      { id: 'b', goalId: 'g', date: '2026-11-12', start: 600, end: 660, stuck: 'וקטורים' },
      { id: 'c', goalId: 'g', date: '2026-11-14', start: 600, end: 660 },
      { id: 'd', goalId: 'other', date: '2026-11-13', start: 600, end: 660, stuck: 'לא שלי' },
    ],
  }
  it('המפגש האחרון לפני התאריך קובע', () => {
    expect(lastStuck(data, 'g', '2026-11-13')).toEqual({ stuck: 'וקטורים', date: '2026-11-12' })
    expect(lastStuck(data, 'g', '2026-11-11')).toEqual({ stuck: 'אינטגרלים', date: '2026-11-10' })
  })
  it('אם במפגש האחרון לא נתקעתי, אין מה להציג', () => {
    expect(lastStuck(data, 'g', '2026-11-20')).toBeNull()
  })
  it('באותו יום רק מפגש שכבר נגמר', () => {
    expect(lastStuck(data, 'g', '2026-11-12', 700)!.stuck).toBe('וקטורים')
    expect(lastStuck(data, 'g', '2026-11-12', 620)!.stuck).toBe('אינטגרלים')
  })
})

describe('תזכורת לגרסה חדשה', () => {
  const withSource = (versionDate?: string): ScheduleData => ({
    ...initialData,
    source: { fileName: 'm.pdf', versionDate, importedAt: '2026-10-20T10:00:00Z' },
  })
  it('קורא תאריך עם נקודות', () => {
    expect(fromDotted('18.10.2026')).toBe('2026-10-18')
    expect(fromDotted('5.1.2027')).toBe('2027-01-05')
    expect(fromDotted('לא תאריך')).toBeUndefined()
  })
  it('מזכיר אחרי שלושה שבועות מתאריך הגרסה, או מהייבוא אם אין תאריך', () => {
    expect(versionAge(withSource('18.10.2026'), '2026-11-07')).toBeNull()
    expect(versionAge(withSource('18.10.2026'), '2026-11-08')).toBe(21)
    expect(versionAge(withSource(undefined), '2026-11-10')).toBe(21)
    expect(versionAge(initialData.source ? { ...initialData, source: undefined } : initialData, '2027-01-01')).toBeNull()
  })
  it('דחייה משתיקה עד התאריך', () => {
    const snoozed = snoozeVersionReminder(withSource('18.10.2026'), '2026-11-26')
    expect(versionAge(snoozed, '2026-11-20')).toBeNull()
    expect(versionAge(snoozed, '2026-11-26')).toBe(39)
  })
})
