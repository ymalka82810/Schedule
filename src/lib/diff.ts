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
  /** השיבוץ במערכת החדשה (נוסף, זז, השתנה) */
  newRef?: string
  /** השיבוץ במערכת השמורה (בוטל, זז, השתנה) */
  oldRef?: string
}

interface Row {
  day: DayIndex
  start: Minutes
  end: Minutes
  label: string
  /** מזהה השיבוץ או משבצת הבחירה */
  ref: string
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
    out.push({ ...e.slot, label: lessonLabel(l), ref: e.id })
  }
  for (const g of data.choiceGroups) {
    const ls = g.optionLessonIds.map((id) => lessons.get(id)).filter((l): l is Lesson => !!l && !l.personal)
    if (!ls.length) continue
    out.push({ ...g.slot, label: ls.map(lessonLabel).sort().join(' / '), ref: g.id })
  }
  return out
}

const pos = (r: Row) => ({ day: r.day, start: r.start, end: r.end, label: r.label })

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
      changes.push({ kind: 'moved', ...pos(n), before: pos(o), newRef: n.ref, oldRef: o.ref })
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
    changes.push({ kind: 'changed', ...pos(n), before: pos(o), newRef: n.ref, oldRef: o.ref })
    oldLeft.splice(i, 1)
    newLeft.splice(j, 1)
  }

  for (const o of oldLeft) changes.push({ kind: 'removed', ...pos(o), oldRef: o.ref })
  for (const n of newLeft) changes.push({ kind: 'added', ...pos(n), newRef: n.ref })

  return changes.sort((a, b) => a.day - b.day || a.start - b.start)
}

/** האם יש מערכת שמורה מקובץ שאפשר להשוות אליה */
export const hasImported = (data: ScheduleData) => data.lessons.some((l) => !l.personal)

/** מפתח יציב לשינוי, לסימון "לא לקבל" */
export const changeKey = (c: Change) => `${c.kind}|${c.oldRef ?? ''}|${c.newRef ?? ''}|${c.label}`

/**
 * מוותר על שינויים מסוימים בגרסה החדשה: השיבוץ החדש יוצא, והישן חוזר כמו שהיה.
 * שיעור ישן שאין לו מקבילה בגרסה החדשה חוזר יחד עם השיבוץ שלו.
 */
export function rejectChanges(before: ScheduleData, after: ScheduleData, rejected: Change[]): ScheduleData {
  if (!rejected.length) return after
  const drop = new Set(rejected.map((c) => c.newRef).filter(Boolean))
  const restore = new Set(rejected.map((c) => c.oldRef).filter(Boolean))
  const lessons = [...after.lessons]
  const oldLessons = new Map(before.lessons.map((l) => [l.id, l]))
  const identity = (l: Lesson) => `${l.name.trim()}|${l.teacher?.trim() ?? ''}|${l.group?.trim() ?? ''}`
  const taken = new Set([...after.lessons.map((l) => l.id), ...after.entries.map((e) => e.id), ...after.choiceGroups.map((g) => g.id)])
  const fresh = (prefix: string) => {
    let n = 1
    while (taken.has(`${prefix}${n}`)) n++
    taken.add(`${prefix}${n}`)
    return `${prefix}${n}`
  }
  /** מזהה השיעור במערכת החדשה: אותו שיעור אם קיים, אחרת השיעור הישן חוזר */
  const lessonId = (oldId: string) => {
    const old = oldLessons.get(oldId)
    if (!old) return oldId
    const same = lessons.find((l) => identity(l) === identity(old))
    if (same) return same.id
    const id = taken.has(old.id) ? fresh('kept') : old.id
    taken.add(id)
    lessons.push({ ...old, id })
    return id
  }
  const entries = after.entries.filter((e) => !drop.has(e.id))
  const choiceGroups = after.choiceGroups.filter((g) => !drop.has(g.id))
  for (const e of before.entries) {
    if (!restore.has(e.id)) continue
    entries.push({ ...e, id: taken.has(e.id) ? fresh('kept') : e.id, lessonId: lessonId(e.lessonId) })
  }
  for (const g of before.choiceGroups) {
    if (!restore.has(g.id)) continue
    const ids = g.optionLessonIds.map(lessonId)
    choiceGroups.push({
      ...g,
      id: taken.has(g.id) ? fresh('kept') : g.id,
      optionLessonIds: ids,
      chosenLessonId: g.chosenLessonId ? lessonId(g.chosenLessonId) : null,
    })
  }
  // שיעור חדש שכבר אין לו שום שיבוץ (כי ויתרתי על השינוי) יוצא
  const used = new Set([...entries.map((e) => e.lessonId), ...choiceGroups.flatMap((g) => g.optionLessonIds)])
  return { ...after, lessons: lessons.filter((l) => l.personal || used.has(l.id)), entries, choiceGroups }
}
