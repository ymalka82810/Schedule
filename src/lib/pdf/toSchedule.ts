import type { ChoiceGroup, ColorKey, FixedEntry, Lesson, ScheduleData } from '../../types'
import type { DraftItem, DraftOption } from './draft'

const PALETTE: ColorKey[] = ['cobalt', 'coral', 'amber', 'moss', 'teal', 'rose', 'slate', 'plum']

const lessonKey = (o: DraftOption) => `${o.name}|${o.teacher ?? ''}|${o.group ?? ''}|${o.room ?? ''}`

/** יוצר נתוני מערכת מהטיוטה. base = מה שכבר שמור: שיעורים אישיים והגדרות נשמרים */
export function draftToData(items: DraftItem[], base: ScheduleData): ScheduleData {
  const personalIds = new Set(base.lessons.filter((l) => l.personal).map((l) => l.id))
  const lessons: Lesson[] = base.lessons.filter((l) => l.personal)
  const entries: FixedEntry[] = base.entries.filter((e) => personalIds.has(e.lessonId))
  const choiceGroups: ChoiceGroup[] = base.choiceGroups.filter((g) =>
    g.optionLessonIds.every((id) => personalIds.has(id)),
  )

  const lessonIds = new Map<string, string>()
  const colors = new Map<string, ColorKey>()
  let n = 0

  const lessonFor = (o: DraftOption): string => {
    const key = lessonKey(o)
    const existing = lessonIds.get(key)
    if (existing) return existing
    if (!colors.has(o.name)) colors.set(o.name, PALETTE[colors.size % PALETTE.length])
    const id = `p${++n}`
    lessons.push({
      id,
      name: o.name,
      teacher: o.teacher || undefined,
      room: o.room || undefined,
      group: o.group || undefined,
      color: colors.get(o.name)!,
    })
    lessonIds.set(key, id)
    return id
  }

  const sorted = [...items].sort((a, b) => a.day - b.day || a.start - b.start)
  sorted.forEach((item, i) => {
    const options = item.options.filter((o) => o.name.trim())
    if (!options.length) return
    const slot = { day: item.day, start: item.start, end: item.end }
    const ids = options.map(lessonFor)
    if (ids.length === 1) {
      entries.push({ id: `pe${i}`, slot, lessonId: ids[0] })
    } else {
      choiceGroups.push({ id: `pg${i}`, slot, optionLessonIds: ids, chosenLessonId: null })
    }
  })

  return { ...base, lessons, entries, choiceGroups }
}

/** בדיקות לפני שמירה. מחזיר רשימת בעיות, ריקה אם הכול תקין */
export function validateDraft(items: DraftItem[]): string[] {
  const problems: string[] = []
  if (!items.length) problems.push('אין שיעורים לשמירה')
  if (items.some((i) => i.end <= i.start)) problems.push('יש שיעור ששעת הסיום שלו לא אחרי שעת ההתחלה')
  if (items.some((i) => !i.options.some((o) => o.name.trim()))) problems.push('יש שיעור בלי שם')
  return problems
}
