import type { Grade, ScheduleData } from '../types'
import { newId } from './edit'
import { sameSubject } from './pdf/parseCell'

/**
 * עדיפות בין המקצועות לפי הציונים האחרונים.
 * כל ציון הופך לרמה בין 0 ל-1 (מבחן: ציון/100, הערכה עצמית: 1 → 0, 5 → 1).
 * הרמה היא ממוצע משוקלל: ציון חדש שוקל יותר (חצי משקל כל שבועיים), ומבחן שוקל פי 2 מהערכה עצמית.
 * צורך: 0.5 ברמה רגילה (75), גבוה יותר ככל שהרמה נמוכה, ועוד ירידה מהציונים הקודמים. מקצוע עם צורך גבוה מקבל יותר תרגול ונכנס קודם לחלונות התרגול.
 */

export interface SubjectPriority {
  subject: string
  /** 0 = שולט, 1 = צריך הרבה עבודה */
  need: number
  level: number
  /** הרמה האחרונה פחות הממוצע של הקודמות. שלילי = ירידה */
  trend: number
  last: Grade
  /** הסבר קצר: "בוחן 62 ב-12.11, ירידה מ-80" */
  reason: string
}

const HALF_LIFE_DAYS = 14
/** רמה רגילה: ציון 75, או הערכה עצמית 4 */
const NORMAL = 0.75
/** ציונים ישנים מזה כבר לא משפיעים */
const MAX_AGE_DAYS = 120

export const levelOf = (g: Grade) => (g.kind === 'exam' ? g.score / 100 : (g.score - 1) / 4)
export const gradeText = (g: Grade) => (g.kind === 'exam' ? `ציון ${g.score}` : `הערכה עצמית ${g.score} מתוך 5`)
const dm = (iso: string) => `${Number(iso.slice(8))}.${Number(iso.slice(5, 7))}`
const days = (a: string, b: string) =>
  Math.round(
    (Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8))) /
      864e5,
  )

/** רמה, מגמה וצורך מקבוצת ציונים (של מקצוע או של נושא) */
function summarize(list: Grade[], asOf: string): Omit<SubjectPriority, 'subject'> {
  list = [...list].sort((a, b) => a.date.localeCompare(b.date))
  let sum = 0
  let weight = 0
  for (const g of list) {
    const w = Math.pow(0.5, days(g.date, asOf) / HALF_LIFE_DAYS) * (g.kind === 'exam' ? 2 : 1)
    sum += levelOf(g) * w
    weight += w
  }
  const level = sum / weight
  const last = list[list.length - 1]
  const earlier = list.slice(0, -1)
  const trend = earlier.length ? levelOf(last) - earlier.reduce((m, g) => m + levelOf(g), 0) / earlier.length : 0
  // 75 נחשב רמה רגילה (צורך 0.5). מתחת לזה הצורך עולה מהר: 50 → 0.8, ומעל יורד: 100 → 0.2
  const need = Math.max(0, Math.min(1, 0.5 + (NORMAL - level) * 1.25 + Math.max(0, -trend)))
  let reason = `${gradeText(last)} ב-${dm(last.date)}`
  if (trend <= -0.1) reason += ', ירידה מהציונים הקודמים'
  else if (trend >= 0.1) reason += ', שיפור מהציונים הקודמים'
  return { need, level, trend, last, reason }
}

const recent = (data: ScheduleData, asOf: string) =>
  (data.grades ?? []).filter((g) => g.date <= asOf && days(g.date, asOf) <= MAX_AGE_DAYS)

/** העדפות לפי מקצוע, נכון לתאריך (ציונים מאוחרים ממנו לא נחשבים). ממוין מהצורך הגבוה לנמוך */
export function priorities(data: ScheduleData, asOf: string): SubjectPriority[] {
  const bySubject = new Map<string, Grade[]>()
  for (const g of recent(data, asOf)) {
    const key = [...bySubject.keys()].find((k) => sameSubject(k, g.subject)) ?? g.subject
    bySubject.set(key, [...(bySubject.get(key) ?? []), g])
  }
  const out: SubjectPriority[] = []
  for (const [subject, list] of bySubject) out.push({ subject, ...summarize(list, asOf) })
  return out.sort((a, b) => b.need - a.need)
}

export interface TopicPriority extends Omit<SubjectPriority, 'subject'> {
  topic: string
}

const topicKey = (t: string) => t.trim().replace(/\s+/g, ' ')

/** נושאים בתוך מקצוע לפי הציונים, מהחלש לחזק. רק ציונים שכתוב בהם נושא */
export function topicPriorities(data: ScheduleData, subject: string, asOf: string): TopicPriority[] {
  const byTopic = new Map<string, Grade[]>()
  for (const g of recent(data, asOf)) {
    if (!g.topic?.trim() || !sameSubject(g.subject, subject)) continue
    const key = [...byTopic.keys()].find((k) => k === topicKey(g.topic!)) ?? topicKey(g.topic)
    byTopic.set(key, [...(byTopic.get(key) ?? []), g])
  }
  return [...byTopic].map(([topic, list]) => ({ topic, ...summarize(list, asOf) })).sort((a, b) => b.need - a.need)
}

/** נושאים חלשים: מתחת לרמה הרגילה, או בירידה */
export const weakTopics = (data: ScheduleData, subject: string, asOf: string) =>
  topicPriorities(data, subject, asOf).filter((t) => t.need >= 0.55)

/** נושאים שכבר הוזנו במקצוע, להשלמה בטופס */
export const knownTopics = (data: ScheduleData, subject: string) => [
  ...new Set(
    [
      ...(data.grades ?? []).filter((g) => g.topic && sameSubject(g.subject, subject)).map((g) => topicKey(g.topic!)),
    ],
  ),
]

/**
 * תזכורת להערכה עצמית: מחמישי אחר הצהריים ועד מוצאי שבת על השבוע הנוכחי,
 * ובראשון ובשני על השבוע שעבר. רק כשחסרה הערכה למקצוע שאני לומד, ולא אמרתי "לא השבוע"
 */
export function selfReminder(
  data: ScheduleData,
  now: Date,
  subjects: string[],
): { weekStart: Date; missing: string[] } | null {
  const day = now.getDay()
  const back = day >= 4 ? 0 : day <= 1 ? 7 : -1
  if (back < 0 || (day === 4 && now.getHours() < 16) || !subjects.length) return null
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day - back)
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const dates = [0, 1, 2, 3, 4, 5, 6].map((i) => iso(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i)))
  if (data.selfRemindSkip === dates[0]) return null
  const missing = subjects.filter(
    (s) => !(data.grades ?? []).some((g) => g.kind === 'self' && sameSubject(g.subject, s) && dates.includes(g.date)),
  )
  return missing.length ? { weekStart, missing } : null
}

/** העדיפות של מקצוע, או undefined כשאין לו ציונים */
export const priorityOf = (list: SubjectPriority[], subject: string | undefined) =>
  subject ? list.find((p) => sameSubject(p.subject, subject)) : undefined

/** כמה תרגול אוטומטי, לפי הצורך: בין פי 0.6 (שולט) לפי 1.4 (צריך הרבה עבודה). בלי ציונים: פי 1 */
export const needFactor = (p: SubjectPriority | undefined) => (p ? 0.6 + 0.8 * p.need : 1)

export function saveGrade(data: ScheduleData, grade: Omit<Grade, 'id'> & { id?: string }): ScheduleData {
  const grades = data.grades ?? []
  if (grade.id && grades.some((g) => g.id === grade.id))
    return { ...data, grades: grades.map((g) => (g.id === grade.id ? { ...g, ...grade, id: g.id } : g)) }
  return { ...data, grades: [...grades, { ...grade, id: newId('grade', grades.map((g) => g.id)) }] }
}

export const removeGrade = (data: ScheduleData, id: string): ScheduleData => ({
  ...data,
  grades: (data.grades ?? []).filter((g) => g.id !== id),
})

/** הערכה עצמית לשבוע: אחת לכל מקצוע בשבוע. מחליפה את הקודמת באותו שבוע */
export function setWeeklySelf(data: ScheduleData, subject: string, weekDates: string[], score: number | null): ScheduleData {
  const grades = data.grades ?? []
  const existing = grades.find((g) => g.kind === 'self' && sameSubject(g.subject, subject) && weekDates.includes(g.date))
  if (score === null) return existing ? removeGrade(data, existing.id) : data
  // תאריך ההערכה: סוף השבוע (חמישי), כדי שתשקף את כל השבוע
  return saveGrade(data, { ...existing, subject, kind: 'self', score, date: existing?.date ?? weekDates[4] })
}
