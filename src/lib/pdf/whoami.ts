import type { DayIndex, Minutes, ScheduleData } from '../../types'
import type { DraftItem, DraftOption } from './draft'
import { DAY_NAMES, formatTime } from '../time'

/**
 * אשף "מי אני": אחרי הקריאה, הטיוטה מכילה את כל הקבוצות של כל המקצועות.
 * כאן המשתמש בוחר אילו מקצועות הוא לומד, ובכל מקצוע עם כמה קבוצות או מרצים, מה שלו.
 */

/** קבוצה או מרצה בתוך מקצוע: אחת מהאפשרויות שהמשתמש בוחר ביניהן */
export interface Variant {
  key: string
  label: string
}

export interface Subject {
  name: string
  /** כמה שיבוצים יש למקצוע בטיוטה */
  count: number
  /** לפי מה מבחינים בין האפשרויות: קבוצה או מרצה */
  by: 'group' | 'teacher'
  /** ריק אם אין מה לבחור (קבוצה אחת או בלי פירוט) */
  variants: Variant[]
}

export interface Selection {
  /** מקצוע → האם אני לומד אותו */
  subjects: Record<string, boolean>
  /** מקצוע → המפתח של הקבוצה/המרצה שלי, או null = עוד לא יודע, להשאיר הכול לבחירה */
  variants: Record<string, string | null>
}

export interface Conflict {
  day: DayIndex
  start: Minutes
  end: Minutes
  names: string[]
}

const subjectName = (o: DraftOption) => o.name.trim()

/** המפתח של אפשרות בתוך המקצוע שלה. מחרוזת ריקה = שיעור לכולם, בלי קבוצה או מרצה מסוימים */
function variantKey(o: DraftOption, by: Subject['by']): string {
  return (by === 'group' ? o.group : o.teacher)?.trim() ?? ''
}

/** אוסף את המקצועות שבטיוטה, ולכל אחד את הקבוצות או המרצים שלו */
export function collectSubjects(items: DraftItem[]): Subject[] {
  const options = new Map<string, DraftOption[]>()
  const counts = new Map<string, number>()
  for (const item of items) {
    const seen = new Set<string>()
    for (const o of item.options) {
      const name = subjectName(o)
      if (!name) continue
      options.set(name, [...(options.get(name) ?? []), o])
      if (!seen.has(name)) counts.set(name, (counts.get(name) ?? 0) + 1)
      seen.add(name)
    }
  }

  const subjects: Subject[] = []
  for (const [name, opts] of options) {
    // אם יש למקצוע קבוצות ממוספרות, הן ההבחנה (אותו מרצה יכול ללמד כמה קבוצות). אחרת לפי מרצה
    const by: Subject['by'] = opts.some((o) => o.group?.trim()) ? 'group' : 'teacher'
    const teachersOf = new Map<string, Set<string>>()
    for (const o of opts) {
      const key = variantKey(o, by)
      if (!key) continue
      const set = teachersOf.get(key) ?? new Set<string>()
      if (by === 'group' && o.teacher?.trim()) set.add(o.teacher.trim())
      teachersOf.set(key, set)
    }
    const variants: Variant[] = [...teachersOf.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'he', { numeric: true }))
      .map(([key, teachers]) => ({
        key,
        label: teachers.size ? `${key} (${[...teachers].join(', ')})` : key,
      }))
    subjects.push({ name, count: counts.get(name) ?? 0, by, variants: variants.length > 1 ? variants : [] })
  }
  return subjects.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'he'))
}

/** האם יש בכלל מה לשאול: מקצוע עם כמה קבוצות, או שיבוץ עם כמה מקצועות במקביל (מגמות) */
export function needsWizard(items: DraftItem[]): boolean {
  if (collectSubjects(items).some((s) => s.variants.length)) return true
  return items.some((i) => new Set(i.options.map(subjectName)).size > 1)
}

/**
 * בחירה התחלתית. אם כבר יש מערכת שמורה, מנחשים ממנה: מקצועות שכבר יש לי,
 * והמרצה או הקבוצה שכבר יש לי בכל מקצוע. בלי מערכת שמורה: כל המקצועות, בלי בחירת קבוצה.
 */
export function initialSelection(subjects: Subject[], current?: ScheduleData): Selection {
  const mine = (current?.lessons ?? []).filter((l) => !l.personal)
  const known = new Set(mine.map((l) => l.name.trim()))
  const anyKnown = subjects.some((s) => known.has(s.name))

  const sel: Selection = { subjects: {}, variants: {} }
  for (const s of subjects) {
    sel.subjects[s.name] = anyKnown ? known.has(s.name) : true
    let chosen: string | null = null
    if (s.variants.length) {
      for (const l of mine.filter((l) => l.name.trim() === s.name)) {
        const key = (s.by === 'group' ? l.group : l.teacher)?.trim()
        if (key && s.variants.some((v) => v.key === key)) {
          chosen = key
          break
        }
      }
    }
    sel.variants[s.name] = chosen
  }
  return sel
}

const subjectsOf = (items: DraftItem[]) => new Map(collectSubjects(items).map((s) => [s.name, s]))

function keeps(o: DraftOption, sel: Selection, subjects: Map<string, Subject>): boolean {
  const name = subjectName(o)
  if (!name) return true
  if (sel.subjects[name] === false) return false
  const subject = subjects.get(name)
  const chosen = sel.variants[name]
  if (!subject || !subject.variants.length || chosen == null) return true
  const key = variantKey(o, subject.by)
  return key === '' || key === chosen
}

const optionKey = (o: DraftOption) => `${o.name}|${o.teacher ?? ''}|${o.group ?? ''}|${o.room ?? ''}`
const signature = (opts: DraftOption[]) => opts.map(optionKey).sort().join('#')

/** מסנן את הטיוטה לפי הבחירה, ומאחד מחדש שיבוצים רצופים שהפכו זהים */
export function applySelection(items: DraftItem[], sel: Selection): DraftItem[] {
  const subjects = subjectsOf(items)
  const filtered: DraftItem[] = []
  for (const item of items) {
    const options = item.options.filter((o) => keeps(o, sel, subjects))
    if (options.length) filtered.push({ ...item, options })
  }

  filtered.sort((a, b) => a.day - b.day || a.start - b.start)
  const merged: DraftItem[] = []
  for (const item of filtered) {
    const prev = merged[merged.length - 1]
    if (prev && prev.day === item.day && prev.end === item.start && signature(prev.options) === signature(item.options)) {
      prev.end = item.end
      prev.check = prev.check || item.check
    } else {
      merged.push({ ...item })
    }
  }
  return merged
}

const label = (o: DraftOption) => {
  const extra = o.group || o.teacher
  return extra ? `${o.name} (${extra})` : o.name
}

/**
 * התנגשויות בטיוטה: שני שיבוצים חופפים באותו יום, או שיבוץ אחד עם כמה מקצועות שונים
 * שכולם נבחרו (למשל שתי מגמות). כמה קבוצות של אותו מקצוע במקביל הן משבצת בחירה, לא התנגשות.
 */
export function findConflicts(items: DraftItem[]): Conflict[] {
  const out: Conflict[] = []
  for (const item of items) {
    if (new Set(item.options.map(subjectName)).size > 1) {
      out.push({ day: item.day, start: item.start, end: item.end, names: item.options.map(label) })
    }
  }
  const sorted = [...items].sort((a, b) => a.day - b.day || a.start - b.start)
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i]
      const b = sorted[j]
      if (b.day !== a.day || b.start >= a.end) break
      // קבוצות שונות של אותו מקצוע במקביל: זו בחירה, לא התנגשות
      const names = new Set([...a.options, ...b.options].map(subjectName))
      if (names.size === 1) continue
      out.push({
        day: a.day,
        start: b.start,
        end: Math.min(a.end, b.end),
        names: [...a.options.map(label), ...b.options.map(label)],
      })
    }
  }
  return out.sort((a, b) => a.day - b.day || a.start - b.start)
}

/**
 * לכל קבוצה/מרצה במקצוע: עם מה היא מתנגשת, בהינתן שאר הבחירות.
 * "תפוס" = שיבוצים שנשארו עם שיעור יחיד אחרי הסינון, בלי המקצוע הנבדק.
 * כך מגלים, למשל, שקבוצות 1 ו-2 של כתיבה מדעית מתנגשות עם האנגלית שלי.
 */
export function variantClashes(items: DraftItem[], sel: Selection, subject: Subject): Map<string, Conflict> {
  const others: Selection = { ...sel, subjects: { ...sel.subjects, [subject.name]: false } }
  const busy = applySelection(items, others).filter((i) => i.options.length === 1)
  const out = new Map<string, Conflict>()

  for (const v of subject.variants) {
    const mine = items.filter((i) =>
      i.options.some((o) => subjectName(o) === subject.name && variantKey(o, subject.by) === v.key),
    )
    for (const m of mine) {
      const hit = busy.find((b) => b.day === m.day && b.start < m.end && m.start < b.end)
      if (hit) {
        out.set(v.key, {
          day: m.day,
          start: Math.max(m.start, hit.start),
          end: Math.min(m.end, hit.end),
          names: [hit.options[0].name],
        })
        break
      }
    }
  }
  return out
}

/** התנגשות כמשפט קצר לתצוגה */
export const describeConflict = (c: Conflict) =>
  `יום ${DAY_NAMES[c.day]} ${formatTime(c.start)}–${formatTime(c.end)}: ${c.names.join(' מול ')}`
