import type { ChoiceGroup, ColorKey, FixedEntry, Lesson, ScheduleData, Slot } from '../../types'
import type { DraftItem, DraftOption } from './draft'

const PALETTE: ColorKey[] = ['cobalt', 'coral', 'amber', 'moss', 'teal', 'rose', 'slate', 'plum']

const lessonKey = (o: DraftOption) => `${o.name}|${o.teacher ?? ''}|${o.group ?? ''}|${o.room ?? ''}`
/** זהות של שיעור בין גרסאות: שם, מרצה וקבוצה (החדר יכול להשתנות) */
const identity = (l: { name: string; teacher?: string; group?: string }) =>
  `${l.name.trim()}|${l.teacher?.trim() ?? ''}|${l.group?.trim() ?? ''}`

export interface SourceInfo {
  fileName: string
  /** "18.10.2026", כפי שנכתב בקובץ */
  versionDate?: string
}

/**
 * יוצר נתוני מערכת מהטיוטה. base = מה שכבר שמור: שיעורים אישיים והגדרות נשמרים,
 * וגם ההתאמות האישיות בשיעורים מהקובץ: הצבע של כל מקצוע והבחירות במשבצות בחירה.
 */
export function draftToData(items: DraftItem[], base: ScheduleData, source?: SourceInfo): ScheduleData {
  const personalIds = new Set(base.lessons.filter((l) => l.personal).map((l) => l.id))
  const lessons: Lesson[] = base.lessons.filter((l) => l.personal)
  const entries: FixedEntry[] = base.entries.filter((e) => personalIds.has(e.lessonId))
  const choiceGroups: ChoiceGroup[] = base.choiceGroups.filter((g) =>
    g.optionLessonIds.every((id) => personalIds.has(id)),
  )

  const lessonIds = new Map<string, string>()
  // צבע שכבר נבחר למקצוע נשמר גם בגרסה החדשה
  const colors = new Map<string, ColorKey>()
  for (const l of base.lessons) if (!colors.has(l.name)) colors.set(l.name, l.color)
  const fresh = PALETTE.filter((c) => ![...colors.values()].includes(c))
  let freshIndex = 0
  let n = 0

  const lessonFor = (o: DraftOption): string => {
    const key = lessonKey(o)
    const existing = lessonIds.get(key)
    if (existing) return existing
    if (!colors.has(o.name)) {
      colors.set(o.name, fresh[freshIndex] ?? PALETTE[(colors.size + freshIndex) % PALETTE.length])
      freshIndex++
    }
    const id = `p${++n}`
    lessons.push({
      id,
      name: o.name,
      teacher: o.teacher || undefined,
      room: o.room || undefined,
      group: o.group || undefined,
      note: o.note || undefined,
      color: colors.get(o.name)!,
    })
    lessonIds.set(key, id)
    return id
  }

  const sorted = [...items].sort((a, b) => a.day - b.day || a.start - b.start)
  // המזהה של השיבוץ הוא המזהה מהטיוטה: כך לחיצה על בלוק בלוח הטיוטה מוצאת את כרטיס העריכה שלו
  sorted.forEach((item) => {
    const options = item.options.filter((o) => o.name.trim())
    if (!options.length) return
    const slot = { day: item.day, start: item.start, end: item.end }
    const ids = options.map(lessonFor)
    if (ids.length === 1) {
      entries.push({ id: item.id, slot, lessonId: ids[0] })
    } else {
      choiceGroups.push({ id: item.id, slot, optionLessonIds: ids, chosenLessonId: chosenFrom(base, slot, ids, lessons) })
    }
  })

  const next: ScheduleData = { ...base, lessons, entries, choiceGroups }
  if (source) next.source = { ...source, importedAt: new Date().toISOString() }
  return next
}

/** בחירה קודמת במשבצת חופפת באותו יום, אם השיעור שנבחר אז קיים גם עכשיו */
function chosenFrom(base: ScheduleData, slot: Slot, ids: string[], lessons: Lesson[]): string | null {
  const baseLessons = new Map(base.lessons.map((l) => [l.id, l]))
  const byId = new Map(lessons.map((l) => [l.id, l]))
  for (const g of base.choiceGroups) {
    if (!g.chosenLessonId || g.slot.day !== slot.day) continue
    if (!(g.slot.start < slot.end && slot.start < g.slot.end)) continue
    const old = baseLessons.get(g.chosenLessonId)
    if (!old) continue
    const match = ids.find((id) => identity(byId.get(id)!) === identity(old))
    if (match) return match
  }
  return null
}

/** בדיקות לפני שמירה. מחזיר רשימת בעיות, ריקה אם הכול תקין */
export function validateDraft(items: DraftItem[]): string[] {
  const problems: string[] = []
  if (!items.length) problems.push('אין שיעורים לשמירה')
  if (items.some((i) => i.end <= i.start)) problems.push('יש שיעור ששעת הסיום שלו לא אחרי שעת ההתחלה')
  if (items.some((i) => !i.options.some((o) => o.name.trim()))) problems.push('יש שיעור בלי שם')
  return problems
}
