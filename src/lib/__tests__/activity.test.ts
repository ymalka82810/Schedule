import { describe, expect, it } from 'vitest'
import { emptyData } from '../../data/empty'
import { addLesson, updateLesson } from '../edit'
import { planWeek, subjectNames } from '../plan'
import { guessActivity } from '../activity'
import { allGoals } from '../suggest'
import type { DayIndex, ScheduleData } from '../../types'

const WEEK = new Date(2026, 10, 15)

/** המערכת כמו בצילום: שיעורים שהוספתי ידנית, ואימון בערב */
function manual(): ScheduleData {
  let d = emptyData
  const add = (name: string, day: DayIndex, start: number, end: number) => {
    d = addLesson(d, { name, color: 'cobalt', slot: { day, start, end } })
  }
  for (const day of [0, 1, 2, 3] as DayIndex[]) {
    add('מתמטיקה', day, 810, 900)
    add('אנגלית', day, 1125, 1215)
    add('אימון', day, 1260, 1320)
  }
  return d
}

describe('שיעור מול פעילות קבועה', () => {
  it('שיעורים שהוספתי ידנית מקבלים תרגול', () => {
    const p = planWeek(manual(), WEEK, '2026-11-15', 8 * 60)
    expect(p.sessions.length).toBeGreaterThan(0)
    const goals = allGoals(manual()).map((g) => g.subject)
    expect(goals).toContain('מתמטיקה')
    expect(goals).toContain('אנגלית')
  })

  it('אימון הוא פעילות: תופס זמן, בלי יעד תרגול', () => {
    const d = manual()
    expect(allGoals(d).some((g) => g.subject === 'אימון')).toBe(false)
    expect(subjectNames(d.lessons)).not.toContain('אימון')
    const p = planWeek(d, WEEK, '2026-11-15', 8 * 60)
    expect(p.sessions.some((s) => s.day === 0 && s.start < 1320 && 1260 < s.end)).toBe(false)
  })

  it('בחירה מפורשת גוברת על הניחוש מהשם', () => {
    let d = manual()
    const run = d.lessons.find((l) => l.name === 'אימון')!
    d = updateLesson(d, run.id, { activity: false })
    expect(allGoals(d).some((g) => g.subject === 'אימון')).toBe(true)
    const math = d.lessons.find((l) => l.name === 'מתמטיקה')!
    d = updateLesson(d, math.id, { activity: true })
    expect(allGoals(d).some((g) => g.subject === 'מתמטיקה')).toBe(false)
  })

  it('ניחוש לפי השם', () => {
    expect(guessActivity('אימון')).toBe(true)
    expect(guessActivity('אימון כושר')).toBe(true)
    expect(guessActivity('לימוד תורה', 'תכנית מיגו')).toBe(true)
    expect(guessActivity('עבודה')).toBe(true)
    expect(guessActivity('מתמטיקה')).toBe(false)
    expect(guessActivity('תרגול פיזיקה')).toBe(false)
  })
})
