import type { DayIndex, Lesson, Minutes, ScheduleData } from '../types'

/**
 * השוואה בין המערכת השמורה לגרסה חדשה מהקובץ: מה נוסף, מה בוטל, מה זז ומה השתנה.
 * שיעורים אישיים (כמו מיגו) לא מגיעים מהקובץ, ולכן לא נכללים בהשוואה.
 */

export interface Change {
  kind: 'added' | 'removed' | 'moved' | 'changed'
  day: DayIndex
  start: Minutes
  end: Minutes
  label: string
  /** ב"זז": איפה זה היה. ב"השתנה": מה היה שם קודם */
  before?: { day: DayIndex; start: Minutes; end: Minutes; label: string }
}

interface Row {
  day: DayIndex
  start: Minutes
  end: Minutes
  label: string
}

const lessonLabel = (l: Lesson) => {
  const parts = [l.name, l.group, l.teacher].filter(Boolean)
  return parts.length > 1 ? `${parts[0]} (${parts.slice(1).join(', ')})` : parts[0]!
}

function rows(data: ScheduleData): Row[] {
  const lessons = new Map(data.lessons.map((l) => [l.id, l]))
  const out: Row[] = []
  for (const e of data.entries) {
    const l = lessons.get(e.lessonId)
    if (!l || l.personal) continue
    out.push({ ...e.slot, label: lessonLabel(l) })
  }
  for (const g of data.choiceGroups) {
    const ls = g.optionLessonIds.map((id) => lessons.get(id)).filter((l): l is Lesson => !!l && !l.personal)
    if (!ls.length) continue
    out.push({ ...g.slot, label: ls.map(lessonLabel).sort().join(' / ') })
  }
  return out
}

const sameTime = (a: Row, b: Row) => a.day === b.day && a.start === b.start && a.end === b.end

export function diffSchedules(before: ScheduleData, after: ScheduleData): Change[] {
  const oldRows = rows(before)
  const newRows = rows(after)

  // 1. מה שלא השתנה בכלל יוצא מההשוואה
  const oldLeft: Row[] = []
  const newLeft = [...newRows]
  for (const o of oldRows) {
    const i = newLeft.findIndex((n) => n.label === o.label && sameTime(n, o))
    if (i >= 0) newLeft.splice(i, 1)
    else oldLeft.push(o)
  }

  const changes: Change[] = []

  // 2. אותו שיעור בשעה אחרת = זז. קודם באותו יום, אחר כך ביום אחר
  for (const sameDay of [true, false]) {
    for (let i = oldLeft.length - 1; i >= 0; i--) {
      const o = oldLeft[i]
      const j = newLeft.findIndex((n) => n.label === o.label && (n.day === o.day) === sameDay)
      if (j < 0) continue
      const n = newLeft[j]
      changes.push({ kind: 'moved', day: n.day, start: n.start, end: n.end, label: n.label, before: o })
      oldLeft.splice(i, 1)
      newLeft.splice(j, 1)
    }
  }

  // 3. אותה שעה, שיעור אחר = השתנה (למשל מרצה חדש)
  for (let i = oldLeft.length - 1; i >= 0; i--) {
    const o = oldLeft[i]
    const j = newLeft.findIndex((n) => sameTime(n, o))
    if (j < 0) continue
    const n = newLeft[j]
    changes.push({ kind: 'changed', day: n.day, start: n.start, end: n.end, label: n.label, before: o })
    oldLeft.splice(i, 1)
    newLeft.splice(j, 1)
  }

  for (const o of oldLeft) changes.push({ kind: 'removed', ...o })
  for (const n of newLeft) changes.push({ kind: 'added', ...n })

  return changes.sort((a, b) => a.day - b.day || a.start - b.start)
}

/** האם יש מערכת שמורה מקובץ שאפשר להשוות אליה */
export const hasImported = (data: ScheduleData) => data.lessons.some((l) => !l.personal)
