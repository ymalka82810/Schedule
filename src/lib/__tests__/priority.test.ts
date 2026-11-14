import { describe, expect, it } from 'vitest'
import { initialData } from '../../data/initial'
import { planWeek } from '../plan'
import { addPracticeWindows } from '../edit'
import { needFactor, priorities, saveGrade, setWeeklySelf } from '../priority'
import { attendedSubjects, autoGoalId } from '../suggest'
import type { ScheduleData } from '../../types'

const WEEK = new Date(2026, 10, 15)
const subjects = attendedSubjects(initialData)
const [A, B] = subjects
const graded = (list: [string, number, string][]): ScheduleData =>
  list.reduce((d, [subject, score, date]) => saveGrade(d, { subject, score, date, kind: 'exam' }), initialData)

describe('עדיפות לפי ציונים', () => {
  it('ציון נמוך = צורך גבוה, ממוין מהחלש לחזק', () => {
    const p = priorities(graded([[A, 90, '2026-11-10'], [B, 55, '2026-11-10']]), '2026-11-14')
    expect(p.map((x) => x.subject)).toEqual([B, A])
    expect(p[0].need).toBeGreaterThan(p[1].need)
  })

  it('ירידה מעלה את הצורך ומוזכרת בהסבר', () => {
    const steady = priorities(graded([[A, 70, '2026-10-20'], [A, 70, '2026-11-10']]), '2026-11-14')[0]
    const drop = priorities(graded([[A, 90, '2026-10-20'], [A, 70, '2026-11-10']]), '2026-11-14')[0]
    expect(drop.need).toBeGreaterThan(steady.need)
    expect(drop.reason).toContain('ירידה')
  })

  it('ציון חדש שוקל יותר מישן, וציון אחרי התאריך לא נחשב', () => {
    const p = priorities(graded([[A, 40, '2026-09-20'], [A, 90, '2026-11-12']]), '2026-11-14')[0]
    expect(p.level).toBeGreaterThan(0.65)
    expect(priorities(graded([[A, 40, '2026-11-20']]), '2026-11-14')).toEqual([])
  })

  it('הערכה עצמית: אחת לשבוע לכל מקצוע, ולחיצה נוספת מחליפה', () => {
    const week = ['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14']
    let d = setWeeklySelf(initialData, A, week, 2)
    d = setWeeklySelf(d, A, week, 4)
    expect(d.grades).toEqual([expect.objectContaining({ subject: A, kind: 'self', score: 4, date: '2026-11-12' })])
    expect(setWeeklySelf(d, A, week, null).grades).toEqual([])
  })
})

describe('התכנון לפי העדיפות', () => {
  const weak = graded([[A, 90, '2026-11-10'], [B, 45, '2026-11-12']])
  const report = (d: ScheduleData, s: string) => planWeek(d, WEEK).report.find((r) => r.goalId === autoGoalId(s))!

  it('מקצוע חלש מקבל יותר תרגול אוטומטי, וחזק פחות, עם הסבר', () => {
    expect(report(weak, B).min).toBeGreaterThan(report(initialData, B).min)
    expect(report(weak, A).min).toBeLessThan(report(initialData, A).min)
    expect(report(weak, B).priority?.reason).toContain('45')
    expect(needFactor(undefined)).toBe(1)
  })

  it('חלונות התרגול החופשי מתמלאים, והמקצוע החלש נכנס אליהם ראשון', () => {
    const plan = planWeek(weak, WEEK)
    for (const w of weak.practiceWindows) {
      const inside = plan.sessions.filter((x) => x.day === w.slot.day && x.start >= w.slot.start && x.end <= w.slot.end)
      const used = inside.reduce((m, x) => m + x.end - x.start, 0)
      expect(used).toBeGreaterThanOrEqual(w.slot.end - w.slot.start - 30)
      expect(inside[0].goalId).toBe(autoGoalId(B))
    }
  })

  it('חלון תרגול שאני מוסיף מתמלא גם הוא', () => {
    const d = addPracticeWindows(initialData, '', [{ day: 0, start: 20 * 60, end: 21 * 60 }])
    const w = d.practiceWindows.at(-1)!
    expect(w.name).toBe('תרגול חופשי')
    const inside = planWeek(d, WEEK).sessions.filter((x) => x.day === 0 && x.start >= 20 * 60 && x.end <= 21 * 60)
    expect(inside.length).toBeGreaterThan(0)
    expect(inside[0].reasons[0]).toContain('תרגול חופשי')
  })
})
