import type { ChoiceGroup, ColorKey, FixedEntry, Lesson, PracticeWindow, ScheduleData, Slot } from '../types'

/**
 * עריכה ישירה של המערכת השמורה (שלב 2). כל פעולה מקבלת נתונים ומחזירה נתונים חדשים, בלי לשנות את המקור.
 */

export const COLORS: ColorKey[] = ['cobalt', 'teal', 'moss', 'amber', 'coral', 'plum', 'slate', 'rose']

/** מה נמצא מאחורי בלוק בלוח */
export type BlockTarget =
  | { kind: 'entry'; entry: FixedEntry; lesson: Lesson }
  | { kind: 'choice'; group: ChoiceGroup; options: Lesson[] }
  | { kind: 'practice'; window: PracticeWindow }

/** מזהה בלוק: שיבוץ, חלון תרגול, או "משבצת:שיעור" במשבצת בחירה (ראו layout.ts) */
export function resolveBlock(data: ScheduleData, blockId: string): BlockTarget | null {
  const lessons = new Map(data.lessons.map((l) => [l.id, l]))
  const entry = data.entries.find((e) => e.id === blockId)
  if (entry) {
    const lesson = lessons.get(entry.lessonId)
    return lesson ? { kind: 'entry', entry, lesson } : null
  }
  const window = (data.practiceWindows ?? []).find((w) => w.id === blockId)
  if (window) return { kind: 'practice', window }
  const groupId = blockId.split(':')[0]
  const group = data.choiceGroups.find((g) => g.id === groupId)
  if (group) {
    const options = group.optionLessonIds.map((id) => lessons.get(id)).filter((l): l is Lesson => !!l)
    return { kind: 'choice', group, options }
  }
  return null
}

const newId = (prefix: string, taken: Iterable<string>) => {
  const used = new Set(taken)
  let n = 1
  while (used.has(`${prefix}${n}`)) n++
  return `${prefix}${n}`
}

/** מוחק שיעורים שאף שיבוץ או משבצת בחירה לא משתמשים בהם */
function dropUnused(data: ScheduleData): ScheduleData {
  const used = new Set([...data.entries.map((e) => e.lessonId), ...data.choiceGroups.flatMap((g) => g.optionLessonIds)])
  return { ...data, lessons: data.lessons.filter((l) => used.has(l.id)) }
}

export type LessonPatch = Partial<Pick<Lesson, 'name' | 'teacher' | 'room' | 'color'>>

/** שינוי פרטי השיעור. חל על כל השיבוצים שלו */
export function updateLesson(data: ScheduleData, lessonId: string, patch: LessonPatch): ScheduleData {
  return { ...data, lessons: data.lessons.map((l) => (l.id === lessonId ? { ...l, ...patch } : l)) }
}

export function moveEntry(data: ScheduleData, entryId: string, slot: Slot): ScheduleData {
  return { ...data, entries: data.entries.map((e) => (e.id === entryId ? { ...e, slot } : e)) }
}

export function removeEntry(data: ScheduleData, entryId: string): ScheduleData {
  return dropUnused({ ...data, entries: data.entries.filter((e) => e.id !== entryId) })
}

/** בחירה במשבצת בחירה. null = ביטול הבחירה, כל האפשרויות מוצגות שוב */
export function chooseOption(data: ScheduleData, groupId: string, lessonId: string | null): ScheduleData {
  return {
    ...data,
    choiceGroups: data.choiceGroups.map((g) => (g.id === groupId ? { ...g, chosenLessonId: lessonId } : g)),
  }
}

export function moveChoice(data: ScheduleData, groupId: string, slot: Slot): ScheduleData {
  return { ...data, choiceGroups: data.choiceGroups.map((g) => (g.id === groupId ? { ...g, slot } : g)) }
}

export function removeChoice(data: ScheduleData, groupId: string): ScheduleData {
  return dropUnused({ ...data, choiceGroups: data.choiceGroups.filter((g) => g.id !== groupId) })
}

export function updatePractice(
  data: ScheduleData,
  windowId: string,
  patch: Partial<Pick<PracticeWindow, 'name' | 'context' | 'slot'>>,
): ScheduleData {
  return {
    ...data,
    practiceWindows: (data.practiceWindows ?? []).map((w) => (w.id === windowId ? { ...w, ...patch } : w)),
  }
}

export function removePractice(data: ScheduleData, windowId: string): ScheduleData {
  return { ...data, practiceWindows: (data.practiceWindows ?? []).filter((w) => w.id !== windowId) }
}

export interface NewLesson {
  name: string
  teacher?: string
  room?: string
  color: ColorKey
  slot: Slot
}

/**
 * הוספת שיעור ידנית. אם כבר יש שיעור באותו שם ומרצה, השיבוץ מצטרף אליו.
 * שיעור חדש מסומן אישי, כדי שייבוא מקובץ לא ימחק אותו.
 */
export function addLesson(data: ScheduleData, input: NewLesson): ScheduleData {
  const name = input.name.trim()
  const teacher = input.teacher?.trim() || undefined
  const room = input.room?.trim() || undefined
  let lesson = data.lessons.find((l) => l.name === name && (l.teacher ?? undefined) === teacher)
  let lessons = data.lessons
  if (!lesson) {
    lesson = { id: newId('m', data.lessons.map((l) => l.id)), name, teacher, room, color: input.color, personal: true }
    lessons = [...lessons, lesson]
  }
  const ids = [...data.entries.map((e) => e.id), ...data.choiceGroups.map((g) => g.id)]
  const entry: FixedEntry = {
    id: newId('me', ids),
    slot: input.slot,
    lessonId: lesson.id,
    room: room && room !== lesson.room ? room : undefined,
  }
  return { ...data, lessons, entries: [...data.entries, entry] }
}

/** בדיקה לפני שמירה של שיבוץ. מחזיר הודעה, או null אם תקין */
export function slotProblem(slot: Slot): string | null {
  if (slot.end <= slot.start) return 'שעת הסיום חייבת להיות אחרי שעת ההתחלה.'
  return null
}

// ---------- גיבוי ----------

/** הגיבוי כקובץ JSON קריא */
export function toBackup(data: ScheduleData): string {
  return JSON.stringify({ app: 'schedule', savedAt: new Date().toISOString(), data }, null, 2)
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** קורא קובץ גיבוי. מקבל גם את הנתונים עצמם בלי המעטפה */
export function fromBackup(text: string): { data: ScheduleData } | { error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { error: 'הקובץ אינו JSON תקין.' }
  }
  const data = isObj(parsed) && isObj(parsed.data) ? parsed.data : parsed
  if (!isObj(data) || data.version !== 1) return { error: 'זה לא קובץ גיבוי של המערכת.' }
  for (const key of ['lessons', 'entries', 'choiceGroups'] as const) {
    if (!Array.isArray(data[key])) return { error: `בקובץ חסר החלק "${key}".` }
  }
  if (!isObj(data.settings)) return { error: 'בקובץ חסרות ההגדרות.' }
  const full: ScheduleData = {
    version: 1,
    lessons: data.lessons as Lesson[],
    entries: data.entries as FixedEntry[],
    choiceGroups: data.choiceGroups as ChoiceGroup[],
    practiceWindows: Array.isArray(data.practiceWindows) ? (data.practiceWindows as PracticeWindow[]) : [],
    goals: Array.isArray(data.goals) ? (data.goals as ScheduleData['goals']) : [],
    events: Array.isArray(data.events) ? (data.events as ScheduleData['events']) : [],
    settings: data.settings as unknown as ScheduleData['settings'],
  }
  if (isObj(data.source)) full.source = data.source as unknown as ScheduleData['source']
  const lessonIds = new Set(full.lessons.map((l) => l.id))
  if (full.entries.some((e) => !lessonIds.has(e.lessonId))) return { error: 'בקובץ יש שיבוץ לשיעור שלא קיים.' }
  return { data: full }
}
