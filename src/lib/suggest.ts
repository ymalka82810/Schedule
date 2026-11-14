import type { Goal, ScheduleData } from '../types'
import { KINDS, guessKind } from './learning'
import { sameSubject } from './pdf/parseCell'

/**
 * יעדים מוצעים מהמקצועות שאני באמת לומד (שיבוצים ובחירות שבחרתי), למקצועות שעוד אין להם יעד.
 * כמה שעות: כחצי מזמן השיעורים בשבוע, בין 2 ל-5. סוג הלמידה לפי השם, וברירת המחדל מיומנות (פתרון תרגילים).
 */
export interface GoalSuggestion {
  subject: string
  goal: Omit<Goal, 'id'>
  /** דקות שיעור בשבוע במקצוע, להסבר */
  classMinutes: number
}

/** המקצועות שאני באמת לומד (שיבוצים ובחירות שבחרתי), לפי זמן השיעורים בשבוע */
export function attendedSubjects(data: ScheduleData): string[] {
  return suggestGoals({ ...data, goals: [] }, { includeOff: true }).map((x) => x.subject)
}

export function suggestGoals(data: ScheduleData, opts: { includeOff?: boolean } = {}): GoalSuggestion[] {
  const lessons = new Map(data.lessons.filter((l) => !l.personal).map((l) => [l.id, l]))
  const minutes = new Map<string, { m: number; color: Goal['color'] }>()
  const add = (lessonId: string | null, m: number) => {
    const l = lessonId ? lessons.get(lessonId) : undefined
    if (!l) return
    const name = l.name.trim()
    const cur = minutes.get(name)
    minutes.set(name, { m: (cur?.m ?? 0) + m, color: cur?.color ?? l.color })
  }
  for (const e of data.entries) add(e.lessonId, e.slot.end - e.slot.start)
  for (const g of data.choiceGroups) add(g.chosenLessonId, g.slot.end - g.slot.start)

  const out: GoalSuggestion[] = []
  for (const [subject, { m, color }] of minutes) {
    if (data.goals.some((g) => (g.subject && sameSubject(g.subject, subject)) || sameSubject(g.name, subject))) continue
    if (!opts.includeOff && (data.plan?.autoOff ?? []).some((x) => x === '*' || sameSubject(x, subject))) continue
    const kind = guessKind(subject)?.kind ?? 'skill'
    const hours = Math.min(5, Math.max(2, Math.round(m / 60 / 2)))
    out.push({
      subject,
      classMinutes: m,
      goal: {
        name: `תרגול ${subject}`,
        subject,
        kind,
        color,
        minHoursPerWeek: hours,
        maxHoursPerWeek: hours + 1,
        preferredWindows: [],
        sessionMinutes: KINDS[kind].session,
        maxPerDay: KINDS[kind].maxPerDay,
      },
    })
  }
  return out.sort((a, b) => b.classMinutes - a.classMinutes)
}

/** מזהה קבוע ליעד האוטומטי של מקצוע, כדי שסימונים והזזות יישארו מחוברים אליו */
export const autoGoalId = (subject: string) => `auto-${subject.replace(/\s+/g, '-')}`

/**
 * כל היעדים שהתכנון עובד לפיהם: היעדים שהגדרתי, ועוד יעד אוטומטי לכל מקצוע שאני לומד ואין לו יעד.
 * כך התרגול משובץ גם בלי שהגדרתי כלום, ויעד שאני מגדיר רק משנה שעות ועדיפות
 */
export function allGoals(data: ScheduleData): Goal[] {
  const auto = suggestGoals(data).map((x) => ({ ...x.goal, id: autoGoalId(x.subject), auto: true }))
  return auto.length ? [...data.goals, ...auto] : data.goals
}
