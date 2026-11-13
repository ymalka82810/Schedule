import type { DayIndex, Minutes, ScheduleData } from '../../types'
import type { DraftItem, DraftOption } from './draft'
import { DAY_NAMES, formatTime } from '../time'
import { teachersOf, type Teacher } from './parseCell'

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
  /** המרצים של המקצוע מטבלת המרצים */
  staff: Teacher[]
}

export interface Selection {
  /** מקצוע → האם אני לומד אותו */
  subjects: Record<string, boolean>
  /** מקצוע → המפתח של הקבוצה/המרצה שלי, או null = עוד לא יודע, להשאיר הכול לבחירה */
  variants: Record<string, string | null>
  /** מקצועות שהבחירה בהם נעשתה אוטומטית, עם ההסבר */
  auto?: Record<string, string>
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

const staffLabel = (t: Teacher) => {
  const extra = [t.detail, t.room].filter(Boolean).join(', ')
  return extra ? `${t.fullName} (${extra})` : t.fullName
}

/**
 * אוסף את המקצועות שבטיוטה, ולכל אחד את הקבוצות או המרצים שלו.
 * מרצים מטבלת המרצים נכנסים גם אם הם לא כתובים באף תא, כי תא שכתוב בו רק "פיזיקה"
 * הוא שיעור של כל המרצים, וצריך לדעת אצל מי אני.
 */
export function collectSubjects(items: DraftItem[], teachers: Teacher[] = []): Subject[] {
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
    const staff = teachersOf(name, teachers)
    // קבוצות ממוספרות הן ההבחנה רק כשיש לפחות שתיים. "קבוצה 1" בודדת היא רעש בטבלה
    const groups = new Set(opts.map((o) => o.group?.trim()).filter(Boolean))
    const by: Subject['by'] = groups.size > 1 ? 'group' : 'teacher'

    let variants: Variant[]
    if (by === 'group') {
      const teachersOfGroup = new Map<string, Set<string>>()
      for (const o of opts) {
        const key = variantKey(o, by)
        if (!key) continue
        const set = teachersOfGroup.get(key) ?? new Set<string>()
        if (o.teacher?.trim()) set.add(o.teacher.trim())
        teachersOfGroup.set(key, set)
      }
      if (staff.length === 1) for (const set of teachersOfGroup.values()) set.add(staff[0].fullName)
      variants = [...teachersOfGroup.entries()]
        .sort(([x], [y]) => x.localeCompare(y, 'he', { numeric: true }))
        .map(([key, ts]) => ({ key, label: ts.size ? `${key} (${[...ts].join(', ')})` : key }))
    } else {
      const keys = new Set(opts.map((o) => variantKey(o, by)).filter(Boolean))
      for (const t of staff) keys.add(t.fullName)
      variants = [...keys]
        .sort((x, y) => x.localeCompare(y, 'he'))
        .map((key) => {
          const t = staff.find((s) => s.fullName === key)
          return { key, label: t ? staffLabel(t) : key }
        })
    }
    subjects.push({ name, count: counts.get(name) ?? 0, by, variants: variants.length > 1 ? variants : [], staff })
  }
  return subjects.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'he'))
}

/** האם יש בכלל מה לשאול: מקצוע עם כמה קבוצות, או שיבוץ עם כמה מקצועות במקביל (מגמות) */
export function needsWizard(items: DraftItem[], teachers: Teacher[] = []): boolean {
  if (collectSubjects(items, teachers).some((s) => s.variants.length)) return true
  return items.some((i) => new Set(i.options.map(subjectName)).size > 1)
}

/**
 * בחירה התחלתית. קודם הבחירות שנשמרו בייבוא הקודם (current.wizard).
 * מקצוע שלא היה אז, או קבוצה שכבר לא קיימת, מנוחשים מהמערכת השמורה: מקצועות שכבר יש לי,
 * והמרצה או הקבוצה שכבר יש לי. בלי שום דבר שמור: כל המקצועות, בלי בחירת קבוצה.
 */
export function initialSelection(
  subjects: Subject[],
  current?: ScheduleData,
  items?: DraftItem[],
  teachers: Teacher[] = [],
): Selection {
  const mine = (current?.lessons ?? []).filter((l) => !l.personal)
  const known = new Set(mine.map((l) => l.name.trim()))
  const anyKnown = subjects.some((s) => known.has(s.name))

  const saved = current?.wizard
  const sel: Selection = { subjects: {}, variants: {} }
  for (const s of subjects) {
    const savedOn = saved?.subjects[s.name]
    sel.subjects[s.name] = savedOn ?? (anyKnown ? known.has(s.name) : true)
    let chosen: string | null = null
    const savedKey = saved?.variants[s.name]
    if (savedKey && s.variants.some((v) => v.key === savedKey)) chosen = savedKey
    else if (s.variants.length) {
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
  return items ? autoChoose(items, sel, subjects, teachers) : sel
}

/**
 * בחירה אוטומטית: מקצוע שעוד לא נבחרה בו קבוצה, ורק אחת מהאפשרויות שלו לא מתנגשת
 * עם שאר המערכת. חוזר על זה עד שאין שינוי, כי בחירה אחת יכולה לפתור את הבאה.
 */
export function autoChoose(items: DraftItem[], sel: Selection, subjects: Subject[], teachers: Teacher[] = []): Selection {
  let next: Selection = { ...sel, variants: { ...sel.variants }, auto: { ...sel.auto } }
  for (let pass = 0; pass < 4; pass++) {
    let changed = false
    for (const s of subjects) {
      if (!s.variants.length || next.subjects[s.name] === false || next.variants[s.name] != null) continue
      // רק אפשרויות שבאמת מופיעות בתאים: מרצה מהטבלה שלא כתוב בשום תא לא מוכיח כלום
      const present = s.variants.filter((v) =>
        items.some((i) => i.options.some((o) => subjectName(o) === s.name && variantKey(o, s.by) === v.key)),
      )
      if (present.length < 2) continue
      const clashes = variantClashes(items, next, s, teachers)
      const free = present.filter((v) => !clashes.has(v.key))
      if (free.length !== 1) continue
      const clashed = present.filter((v) => clashes.has(v.key)).map((v) => v.key)
      next = {
        ...next,
        variants: { ...next.variants, [s.name]: free[0].key },
        auto: { ...next.auto, [s.name]: `נבחרה אוטומטית: רק היא לא מתנגשת (${clashed.join(', ')} מתנגשות)` },
      }
      changed = true
    }
    if (!changed) break
  }
  return next
}

const subjectsOf = (items: DraftItem[], teachers: Teacher[]) =>
  new Map(collectSubjects(items, teachers).map((s) => [s.name, s]))

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

const optionKey = (o: DraftOption) => `${o.name}|${o.teacher ?? ''}|${o.group ?? ''}|${o.room ?? ''}|${o.kind ?? ''}`
const signature = (opts: DraftOption[]) => opts.map(optionKey).sort().join('#')

/**
 * משלים מרצה, חדר והערה לשיעור שכתוב בו רק שם המקצוע:
 * לפי המרצה שבחרתי במקצוע, או לפי המרצה היחיד שמלמד אותו בטבלה.
 */
function complete(o: DraftOption, sel: Selection, subject: Subject | undefined): DraftOption {
  if (!subject) return o
  const out = { ...o }
  if (!out.teacher) {
    const chosen = subject.by === 'teacher' ? sel.variants[subject.name] : null
    if (chosen) out.teacher = chosen
    else if (subject.staff.length === 1) out.teacher = subject.staff[0].fullName
  }
  const t = subject.staff.find((s) => s.fullName === out.teacher)
  if (!out.room && t?.room) out.room = t.room
  const note = subject.staff.find((s) => s.note)?.note
  if (!out.note && note) out.note = note
  return out
}

/**
 * מסנן את הטיוטה לפי הבחירה, משלים מרצים וחדרים מטבלת המרצים,
 * ומאחד מחדש שיבוצים רצופים שהפכו זהים.
 */
export function applySelection(items: DraftItem[], sel: Selection, teachers: Teacher[] = []): DraftItem[] {
  const subjects = subjectsOf(items, teachers)
  const filtered: DraftItem[] = []
  for (const item of items) {
    const options = item.options
      .filter((o) => keeps(o, sel, subjects))
      .map((o) => complete(o, sel, subjects.get(subjectName(o))))
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
export function variantClashes(
  items: DraftItem[],
  sel: Selection,
  subject: Subject,
  teachers: Teacher[] = [],
): Map<string, Conflict> {
  const others: Selection = { ...sel, subjects: { ...sel.subjects, [subject.name]: false } }
  const busy = applySelection(items, others, teachers).filter((i) => i.options.length === 1)
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

/** שומר את בחירות האשף עם המערכת. מקצועות שלא הופיעו בקובץ הזה שומרים את הבחירה הקודמת */
export function withWizard(data: ScheduleData, sel: Selection): ScheduleData {
  return {
    ...data,
    wizard: {
      subjects: { ...data.wizard?.subjects, ...sel.subjects },
      variants: { ...data.wizard?.variants, ...sel.variants },
    },
  }
}
