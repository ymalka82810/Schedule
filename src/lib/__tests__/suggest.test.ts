import { describe, expect, it } from 'vitest'
import { initialData } from '../../data/initial'
import { allGoals, autoGoalId, suggestGoals } from '../suggest'
import { saveGoal } from '../edit'
import { planWeek } from '../plan'

describe('יעדים מוצעים מהמקצועות', () => {
  const list = suggestGoals(initialData)

  it('מציע יעד לכל מקצוע שאני לומד, עם מקצוע, סוג ושעות סבירות', () => {
    expect(list.length).toBeGreaterThan(0)
    for (const x of list) {
      expect(x.goal.subject).toBe(x.subject)
      expect(x.goal.kind).toBeTruthy()
      expect(x.goal.minHoursPerWeek).toBeGreaterThanOrEqual(2)
      expect(x.goal.minHoursPerWeek).toBeLessThanOrEqual(5)
    }
    expect(new Set(list.map((x) => x.subject)).size).toBe(list.length)
  })

  it('מקצוע שכבר יש לו יעד לא מוצע שוב', () => {
    const withOne = saveGoal(initialData, list[0].goal)
    expect(suggestGoals(withOne).map((x) => x.subject)).not.toContain(list[0].subject)
  })

  it('אחרי הוספת ההצעות, השבוע הבא מתמלא בתרגול', () => {
    const data = list.reduce((d, x) => saveGoal(d, x.goal), initialData)
    const s = planWeek(data, new Date(2026, 10, 15)).sessions
    expect(s.length).toBeGreaterThan(list.length)
  })
})

describe('תרגול אוטומטי בלי יעדים', () => {
  const WEEK = new Date(2026, 10, 15)

  it('בלי אף יעד, השבוע מתמלא בתרגול לכל מקצוע', () => {
    const s = planWeek({ ...initialData, goals: [] }, WEEK).sessions
    const subjects = new Set(s.map((x) => x.goalId))
    expect(subjects.size).toBe(suggestGoals(initialData).length)
    expect(s.every((x) => x.goalId.startsWith('auto-'))).toBe(true)
  })

  it('יעד שהגדרתי מחליף את האוטומטי של אותו מקצוע ובוחר מקום קודם', () => {
    const subject = suggestGoals(initialData)[0].subject
    const mine = saveGoal(initialData, {
      name: `${subject} ברצינות`, subject, color: 'rose', minHoursPerWeek: 6, maxHoursPerWeek: 6, preferredWindows: [],
    })
    const p = planWeek(mine, WEEK)
    expect(p.sessions.some((x) => x.goalId === autoGoalId(subject))).toBe(false)
    const myId = mine.goals[0].id
    expect(p.report.find((r) => r.goalId === myId)!.planned).toBeGreaterThanOrEqual(6 * 60)
  })

  it('שינוי ביעד אוטומטי שומר אותו עם אותו מזהה, בלי הסימון "אוטומטי"', () => {
    const auto = allGoals(initialData).find((g) => g.auto)!
    const next = saveGoal(initialData, { ...auto, minHoursPerWeek: 1 })
    expect(next.goals).toEqual([expect.objectContaining({ id: auto.id, minHoursPerWeek: 1 })])
    expect(next.goals[0].auto).toBeUndefined()
    expect(allGoals(next).filter((g) => g.id === auto.id)).toHaveLength(1)
  })

  it('אפשר לכבות מקצוע, או הכול', () => {
    const subject = suggestGoals(initialData)[0].subject
    const off = { ...initialData, plan: { ...initialData.plan!, autoOff: [subject] } } as typeof initialData
    expect(allGoals(off).some((g) => g.subject === subject)).toBe(false)
    const all = { ...initialData, plan: { ...initialData.plan!, autoOff: ['*'] } } as typeof initialData
    expect(allGoals(all)).toEqual([])
  })
})
