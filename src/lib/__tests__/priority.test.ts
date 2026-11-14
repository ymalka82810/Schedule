import { describe, expect, it } from 'vitest'
import { initialData } from '../../data/initial'
import { planWeek } from '../plan'
import { addPracticeWindows } from '../edit'
import { needFactor, priorities, saveGrade, selfReminder, setWeeklySelf, weakTopics } from '../priority'
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

describe('נושאים בתוך מקצוע', () => {
  const withTopics = (list: [string, number, string][]): ScheduleData =>
    list.reduce((d, [topic, score, date]) => saveGrade(d, { subject: B, topic, score, date, kind: 'exam' }), initialData)

  it('נושא חלש מזוהה, ונושא חזק לא', () => {
    const d = withTopics([['וקטורים', 50, '2026-11-10'], ['תנועה', 92, '2026-11-11']])
    expect(weakTopics(d, B, '2026-11-14').map((t) => t.topic)).toEqual(['וקטורים'])
  })

  it('מפגשי התרגול של המקצוע מקבלים נושא להתמקד בו, ברוטציה בין הנושאים החלשים', () => {
    const d = withTopics([['וקטורים', 50, '2026-11-10'], ['כוחות', 60, '2026-11-11']])
    const s = planWeek(d, WEEK).sessions.filter((x) => x.goalId === autoGoalId(B))
    expect(s.length).toBeGreaterThan(1)
    expect(s[0].title).toContain('וקטורים')
    expect(s[1].title).toContain('כוחות')
    expect(s[0].reasons.join(' ')).toContain('במה להתמקד')
  })
})

describe('תזכורת להערכה עצמית', () => {
  it('מחמישי אחר הצהריים על השבוע הנוכחי, בראשון על השבוע שעבר, ובאמצע השבוע לא', () => {
    expect(selfReminder(initialData, new Date(2026, 10, 12, 18), subjects)?.weekStart.getDate()).toBe(8)
    expect(selfReminder(initialData, new Date(2026, 10, 12, 10), subjects)).toBeNull()
    expect(selfReminder(initialData, new Date(2026, 10, 15, 10), subjects)?.weekStart.getDate()).toBe(8)
    expect(selfReminder(initialData, new Date(2026, 10, 17, 10), subjects)).toBeNull()
  })

  it('נעלמת כשכל המקצועות הוערכו, או אחרי "לא השבוע"', () => {
    const week = ['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14']
    const now = new Date(2026, 10, 14, 21)
    const some = setWeeklySelf(initialData, A, week, 3)
    expect(selfReminder(some, now, subjects)?.missing).not.toContain(A)
    const all = subjects.reduce((d, s) => setWeeklySelf(d, s, week, 3), initialData)
    expect(selfReminder(all, now, subjects)).toBeNull()
    expect(selfReminder({ ...initialData, selfRemindSkip: '2026-11-08' }, now, subjects)).toBeNull()
  })
})
