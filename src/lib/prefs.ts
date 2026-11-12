import type { DayIndex, Minutes, PlanFeedback, ScheduleData, SessionPin } from '../types'
import { DAY_NAMES, dateOfDay } from './time'
import { newId } from './edit'
import type { PlannedSession } from './plan'

/**
 * לומדים מההזזות: כשמזיזים או דוחים מפגש מתוכנן, נשמר רישום. דפוס שחוזר לפחות פעמיים (בתאריכים שונים)
 * הופך להעדפה: התכנון נמנע מהשעות או מהימים שתמיד מפנים מהם, ומעדיף את אלה שתמיד מעבירים אליהם.
 * ההעדפה רכה: אם אין מקום אחר, מפגש עדיין יכול להיכנס לשם.
 * הזזה לכיוון ההפוך מקזזת: מי שהפסיק להזיז, ההעדפה נעלמת לבד.
 */

/** מכמה פעמים בתאריכים שונים דפוס הופך להעדפה */
export const THRESHOLD = 2
/** כמה ימים מתוך כל היעדים צריך לפנות כדי שהיום ייחשב עמוס בכלל */
export const BUSY_DAY_THRESHOLD = 3
const AVOID = 5
const PREFER = 3
/** כמה רישומים שומרים לכל היותר (הישנים נמחקים) */
const MAX_FEEDBACK = 80

export type BandKey = 'morning' | 'noon' | 'afternoon' | 'evening'

export const BANDS: { key: BandKey; label: string; from: Minutes; to: Minutes }[] = [
  { key: 'morning', label: 'בבוקר', from: 0, to: 12 * 60 },
  { key: 'noon', label: 'בצהריים', from: 12 * 60, to: 16 * 60 },
  { key: 'afternoon', label: 'אחר הצהריים', from: 16 * 60, to: 19 * 60 },
  { key: 'evening', label: 'בערב', from: 19 * 60, to: 24 * 60 },
]

export const bandOf = (start: Minutes): BandKey => BANDS.find((b) => start >= b.from && start < b.to)?.key ?? 'evening'
const bandLabel = (k: BandKey) => BANDS.find((b) => b.key === k)!.label

export interface Pref {
  /** חסר = לכל היעדים (יום עמוס) */
  goalId?: string
  kind: 'avoid' | 'prefer'
  dim: 'band' | 'day'
  value: BandKey | DayIndex
  /** בכמה תאריכים שונים הדפוס הופיע (נטו) */
  count: number
  /** תיאור קצר בעברית, להצגה */
  label: string
}

/** האם הרישום "מפנה" מהערך: נדחה, או הוזז לערך אחר */
const leaves = (f: PlanFeedback, dim: 'band' | 'day', value: BandKey | DayIndex) => {
  if (dim === 'band') {
    if (bandOf(f.start) !== value) return false
    return f.action === 'removed' || (f.toStart !== undefined && bandOf(f.toStart) !== value)
  }
  if (f.day !== value) return false
  return f.action === 'removed' || (f.toDay !== undefined && f.toDay !== value)
}

/** האם הרישום "מעביר אל" הערך */
const enters = (f: PlanFeedback, dim: 'band' | 'day', value: BandKey | DayIndex) => {
  if (f.action !== 'moved') return false
  if (dim === 'band') return f.toStart !== undefined && bandOf(f.toStart) === value && bandOf(f.start) !== value
  return f.toDay === value && f.day !== value
}

const distinctDates = (list: PlanFeedback[]) => new Set(list.map((f) => f.date)).size

/** ההעדפות שנלמדו מההיסטוריה */
export function learnedPrefs(data: ScheduleData): Pref[] {
  const feedback = data.planFeedback ?? []
  const goals = new Map(data.goals.map((g) => [g.id, g.name]))
  const out: Pref[] = []
  const dims: { dim: 'band' | 'day'; values: (BandKey | DayIndex)[] }[] = [
    { dim: 'band', values: BANDS.map((b) => b.key) },
    { dim: 'day', values: [0, 1, 2, 3, 4, 5, 6] },
  ]
  const describe = (dim: 'band' | 'day', value: BandKey | DayIndex) =>
    dim === 'band' ? bandLabel(value as BandKey) : `ביום ${DAY_NAMES[value as DayIndex]}`

  for (const [goalId, name] of goals) {
    const mine = feedback.filter((f) => f.goalId === goalId)
    if (!mine.length) continue
    for (const { dim, values } of dims) {
      for (const value of values) {
        const net = distinctDates(mine.filter((f) => leaves(f, dim, value))) - distinctDates(mine.filter((f) => enters(f, dim, value)))
        if (net >= THRESHOLD) {
          out.push({ goalId, kind: 'avoid', dim, value, count: net, label: `${name}: לא ${describe(dim, value)}` })
        } else if (-net >= THRESHOLD) {
          out.push({ goalId, kind: 'prefer', dim, value, count: -net, label: `${name}: עדיף ${describe(dim, value)}` })
        }
      }
    }
  }

  // יום עמוס: מפנים ממנו מפגשים של לפחות שני יעדים שונים
  for (const day of [0, 1, 2, 3, 4, 5, 6] as DayIndex[]) {
    const out_ = feedback.filter((f) => leaves(f, 'day', day))
    const in_ = feedback.filter((f) => enters(f, 'day', day))
    const key = (f: PlanFeedback) => `${f.goalId}|${f.date}`
    const net = new Set(out_.map(key)).size - new Set(in_.map(key)).size
    if (net >= BUSY_DAY_THRESHOLD && new Set(out_.map((f) => f.goalId)).size >= 2) {
      out.push({ kind: 'avoid', dim: 'day', value: day, count: net, label: `יום ${DAY_NAMES[day]} עמוס: פחות מפגשים בו` })
    }
  }
  return out
}

/** כמה ההעדפות מעלות או מורידות מקום מסוים ליעד, ולמה */
export function prefScore(prefs: Pref[], goalId: string, day: DayIndex, start: Minutes): { sc: number; reasons: string[]; avoided: boolean } {
  let sc = 0
  const reasons: string[] = []
  let avoided = false
  const band = bandOf(start)
  for (const p of prefs) {
    if (p.goalId && p.goalId !== goalId) continue
    const hit = p.dim === 'band' ? p.value === band : p.value === day
    if (!hit) continue
    if (p.kind === 'avoid') {
      sc -= p.goalId ? AVOID : AVOID - 2
      avoided = true
    } else {
      sc += PREFER
      reasons.push(
        p.dim === 'band'
          ? `${bandLabel(band)}, כי לשם אתה בדרך כלל מזיז את המפגשים האלה`
          : `ביום ${DAY_NAMES[day]}, כי לשם אתה בדרך כלל מזיז את המפגשים האלה`,
      )
    }
  }
  return { sc, reasons, avoided }
}

/** שוכח העדפה: מוחק את הרישומים שיצרו אותה */
export function forgetPref(data: ScheduleData, p: Pref): ScheduleData {
  const matches = (f: PlanFeedback) =>
    (!p.goalId || f.goalId === p.goalId) &&
    (p.kind === 'avoid' ? leaves(f, p.dim, p.value) : enters(f, p.dim, p.value))
  return { ...data, planFeedback: (data.planFeedback ?? []).filter((f) => !matches(f)) }
}

// ---------- הזזה ודחייה של מפגשים מתוכננים ----------

const trim = (list: PlanFeedback[]) => list.slice(-MAX_FEEDBACK)

/** הצמדות ודחיות מלפני יותר מחודש כבר לא משפיעות על כלום */
function prune(data: ScheduleData, today: string): ScheduleData {
  const limit = new Date(`${today}T00:00:00`)
  limit.setDate(limit.getDate() - 35)
  const min = `${limit.getFullYear()}-${String(limit.getMonth() + 1).padStart(2, '0')}-${String(limit.getDate()).padStart(2, '0')}`
  return {
    ...data,
    planPins: (data.planPins ?? []).filter((p) => p.date >= min),
    planSkips: (data.planSkips ?? []).filter((p) => p.date >= min),
  }
}

/**
 * הזזה של מפגש מתוכנן בגרירה: המפגש נצמד למקום החדש בשבוע הזה, ונרשם מאיפה לאן.
 * הזזה חוזרת של אותו מפגש מעדכנת את אותו רישום. החזרה בדיוק למקום המקורי מבטלת את ההזזה.
 */
export function movePlanned(
  data: ScheduleData,
  session: PlannedSession,
  weekStart: Date,
  toDay: DayIndex,
  toStart: Minutes,
  /** אורך חדש (שינוי אורך מהקצה). חסר = כמו שהיה */
  toEnd: Minutes = toStart + (session.end - session.start),
): ScheduleData {
  const pins = data.planPins ?? []
  const existing = session.pinId ? pins.find((p) => p.id === session.pinId) : undefined
  const from = existing
    ? { date: existing.fromDate, start: existing.fromStart }
    : { date: dateOfDay(weekStart, session.day), start: session.start }
  const toDate = dateOfDay(weekStart, toDay)
  const len = toEnd - toStart
  const origLen = existing
    ? (existing.fromEnd ?? existing.fromStart + (existing.end - existing.start)) - existing.fromStart
    : session.end - session.start
  if (existing && toDate === from.date && toStart === from.start && len === origLen) return unpinPlanned(data, existing.id)

  const fromDay = dayOfDate(weekStart, from.date) ?? session.day
  const feedback = data.planFeedback ?? []
  const feedbackId = existing?.feedbackId ?? newId('f', feedback.map((f) => f.id))
  const record: PlanFeedback = {
    id: feedbackId,
    goalId: session.goalId,
    date: from.date,
    day: fromDay,
    start: from.start,
    action: 'moved',
    toDay,
    toStart,
  }
  const pin: SessionPin = {
    id: existing?.id ?? newId('pin', pins.map((p) => p.id)),
    goalId: session.goalId,
    date: toDate,
    start: toStart,
    end: toEnd,
    fromEnd: from.start + origLen,
    ...(session.reviewId ? { reviewId: session.reviewId } : {}),
    fromDate: from.date,
    fromStart: from.start,
    feedbackId,
  }
  const next: ScheduleData = {
    ...data,
    planPins: [...pins.filter((p) => p.id !== pin.id), pin],
    planFeedback: trim([...feedback.filter((f) => f.id !== feedbackId), record]),
  }
  return prune(next, toDate)
}

/** מחזיר מפגש שהוזז לתכנון האוטומטי, ומוחק את הרישום שההזזה יצרה (כאילו לא הוזז) */
export function unpinPlanned(data: ScheduleData, pinId: string): ScheduleData {
  const pin = (data.planPins ?? []).find((p) => p.id === pinId)
  if (!pin) return data
  return {
    ...data,
    planPins: (data.planPins ?? []).filter((p) => p.id !== pinId),
    planFeedback: (data.planFeedback ?? []).filter((f) => f.id !== pin.feedbackId),
  }
}

/** "לא מתאים לי כאן": המפגש יקבל מקום אחר, ונרשם שדחיתי את השעה הזו */
export function skipPlanned(data: ScheduleData, session: PlannedSession, date: string): ScheduleData {
  const skips = data.planSkips ?? []
  const feedback = data.planFeedback ?? []
  const base = session.pinId ? { ...data, planPins: (data.planPins ?? []).filter((p) => p.id !== session.pinId) } : data
  const next: ScheduleData = {
    ...base,
    planSkips: [
      ...skips,
      {
        id: newId('skip', skips.map((s) => s.id)),
        goalId: session.goalId,
        date,
        start: session.start,
        end: session.end,
        ...(session.reviewId ? { reviewId: session.reviewId } : {}),
      },
    ],
    planFeedback: trim([
      ...feedback,
      {
        id: newId('f', feedback.map((f) => f.id)),
        goalId: session.goalId,
        date,
        day: session.day,
        start: session.start,
        action: 'removed',
      },
    ]),
  }
  return prune(next, date)
}

function dayOfDate(weekStart: Date, date: string): DayIndex | undefined {
  return ([0, 1, 2, 3, 4, 5, 6] as DayIndex[]).find((d) => dateOfDay(weekStart, d) === date)
}
