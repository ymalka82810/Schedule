import type { DayIndex, Goal, Lesson, Minutes, PlanSettings, ScheduleData } from '../types'
import { sameSubject } from './pdf/parseCell'
import { placeRoutines, type PlacedRoutine } from './routines'
import { DAY_NAMES, dateOfDay, formatTime } from './time'
import { isChag, isErev } from './hebrew'
import { INTERVALS, KINDS, MAX_REVIEWS_PER_DAY, REVIEW_MINUTES, intervalText, maxPerDay, sessionLength } from './learning'
import { learnedPrefs, prefScore } from './prefs'
import { validRange } from './semester'
import { allGoals } from './suggest'
import type { Slot } from '../types'

/**
 * תכנון הזמן הפנוי (שלב 4). לכל שבוע מחשבים מחדש איפה לשבץ את היעדים הגמישים:
 * רק בזמן פנוי, עם הפסקות, בלי שבת, ולפי מה שבאמת עוזר ללמידה: תרגול אחרי השיעור
 * או ערב לפני השיעור הבא, פיזור על פני השבוע, וחלונות התרגול (מיגו) קודם.
 * כל שיבוץ מגיע עם הסבר למה הוא שם.
 * ליעד עם סוג למידה (ידע / מיומנות / יצירה) נוספים כללי מנוע הלמידה: אורך מפגש ותקרה יומית לפי הסוג,
 * יום הפסקה מהתחום, ערבוב תחומים באותו יום, למידה קשה בשעות החדות, וחזרות מרווחות בתאריך שלהן.
 */

export const DEFAULT_PLAN: PlanSettings = {
  dayStart: 8 * 60,
  dayEnd: 23 * 60,
  breakMinutes: 15,
  fridayEnd: 12 * 60,
  offDays: [6],
  maxHoursPerDay: 4,
}

export const planSettings = (data: ScheduleData): PlanSettings => ({ ...DEFAULT_PLAN, ...data.plan })

/** יום שאפשר לתכנן בו (לא שבת וכד') */
export const isWorkDay = (s: PlanSettings, day: DayIndex) => !s.offDays.includes(day)

/**
 * השבוע שהאתר נפתח עליו: השבוע הנוכחי, או הבא כשבנוכחי כבר לא נשאר זמן לתכנן
 * (למשל במוצאי שבת, או בשישי אחרי שעת הסיום). אחרת נפתח לוח של שבוע שנגמר, בלי שום מפגש מתוכנן
 */
export function activeWeek(data: ScheduleData, now: Date): { weekStart: Date; day: DayIndex } {
  const s = planSettings(data)
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay())
  const today = now.getDay() as DayIndex
  const nowMin = now.getHours() * 60 + now.getMinutes()
  for (let d = today; d <= 6; d++) {
    const day = d as DayIndex
    if (!isWorkDay(s, day)) continue
    const end = day === 5 && s.fridayEnd !== null ? s.fridayEnd : s.dayEnd
    if (day > today || nowMin < end) return { weekStart: start, day: today }
  }
  const next = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7)
  const first = ([0, 1, 2, 3, 4, 5, 6] as DayIndex[]).find((d) => isWorkDay(s, d)) ?? 0
  return { weekStart: next, day: first }
}

/** ברירת מחדל לעומס יומי כולל: שיעורים ותרגול יחד */
export const DEFAULT_MAX_LOAD = 10

/** משהו שתופס זמן בשבוע מסוים */
export interface Busy {
  day: DayIndex
  start: Minutes
  end: Minutes
  label: string
  kind: 'lesson' | 'event'
  /** שמות המקצועות בשיבוץ: אחד, או כל האפשרויות במשבצת בחירה שעוד לא נבחרה */
  names?: string[]
  /** סוג השיעור לכל שם (הרצאה / תרגול / מעבדה), באותו סדר */
  kinds?: (string | undefined)[]
}

/** זמן שהתכנון שומר בצד: נסיעה למוסד וממנו, ושגרות כמו ארוחות ותפילות */
export interface Reserved {
  day: DayIndex
  start: Minutes
  end: Minutes
  label: string
  kind: 'travel' | 'routine'
  routineId?: string
}

export interface PlannedSession {
  id: string
  goalId: string
  day: DayIndex
  start: Minutes
  end: Minutes
  /** למה דווקא כאן, בשפה פשוטה */
  reasons: string[]
  /** סומן שתרגלתי */
  done?: boolean
  /** שם להצגה במקום שם היעד (חזרה על נושא) */
  title?: string
  /** מפגש חזרה מרווחת: מזהה החזרה */
  reviewId?: string
  /** מזהה הרישום ביומן, במפגש שסומן */
  logId?: string
  /** הוזז בגרירה: מזהה ההצמדה */
  pinId?: string
  /** היה מתוכנן לזמן שכבר עבר ולא סומן. לא נספר ביעד, והתכנון משלים אותו בהמשך */
  missed?: boolean
}

export interface GoalReport {
  goalId: string
  name: string
  /** דקות ששובצו (כולל מה שבוצע) */
  planned: Minutes
  /** דקות שסומנו כבוצעו */
  done: Minutes
  min: Minutes
  max: Minutes
  /** למה היעד גדל השבוע, אם גדל (מבחן קרוב) */
  boost?: string
  /** חזרות מרווחות השבוע: כמה מתוכננות (כולל שבוצעו) וכמה בוצעו */
  reviews: number
  reviewsDone: number
  /** יעד עם תאריך יעד: כמה שעות נשארו בתחילת השבוע, ועד מתי */
  deadline?: { date: string; remainingHours: number; passed: boolean; buffer?: string }
  /** מפגשים שהוזזו כדי לפנות מקום ליעד הזה */
  rearranged?: number
  /** דקות שתוכננו לזמן שעבר ולא סומנו */
  missed: Minutes
}

export interface WeekPlan {
  sessions: PlannedSession[]
  report: GoalReport[]
  /** נסיעות ושגרות ששמורות השבוע */
  reserved: Reserved[]
}

interface Interval {
  start: Minutes
  end: Minutes
}

const STEP = 15

/** החופשה שהתאריך נופל בה, אם יש */
export const breakOn = (data: ScheduleData, date: string) =>
  (data.breaks ?? []).find((b) => b.from <= date && date <= b.to)

/** האם השיבוץ מבוטל בתאריך הזה: ביטול ידני, חג או חופשה */
export function isCancelled(data: ScheduleData, refId: string, date: string): boolean {
  return (
    isChag(date) ||
    !!breakOn(data, date) ||
    (data.cancellations ?? []).some((c) => c.refId === refId && c.date === date)
  )
}

/** הפרש בימים בין שני תאריכים YYYY-MM-DD */
export const dayDiff = (a: string, b: string) =>
  Math.round(
    (Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8)) -
      Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8))) /
      864e5,
  )

/** מבחנים במקצוע מהשבוע הזה ועד שבועיים קדימה */
function upcomingExams(data: ScheduleData, subject: string, weekStart: Date) {
  const first = dateOfDay(weekStart, 0)
  return data.events
    .filter((e) => e.examSubject && sameName(e.examSubject, subject))
    .filter((e) => {
      const d = dayDiff(first, e.date)
      return d >= 0 && d <= 13
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** האם השיעור בתוקף בתאריך (סמסטר א' בלבד וכד') */
export function activeOn(l: Lesson | undefined, date: string, semesters?: ScheduleData['semesters']) {
  if (!l) return false
  const { from, to } = validRange(l, semesters)
  return (!from || date >= from) && (!to || date <= to)
}

/** הזזה בשבוע אחד של שיבוץ קבוע, לפי התאריך שבו היה אמור להיות */
export const moveOf = (data: ScheduleData, refId: string, date: string) =>
  (data.moves ?? []).find((m) => m.refId === refId && m.date === date)

/**
 * איפה השיבוץ הקבוע נמצא בשבוע המוצג: במקום הקבוע, או במקום שאליו הוזז בשבוע הזה בלבד.
 * date הוא התאריך המקורי (לביטולים ולהזזות). ביטול גובר על הזזה
 */
export function placeOf(data: ScheduleData, refId: string, slot: Slot, weekStart: Date): Slot & { date: string; moved: boolean } {
  const date = dateOfDay(weekStart, slot.day)
  const mv = isCancelled(data, refId, date) ? undefined : moveOf(data, refId, date)
  const day = mv ? DAYS_OF_WEEK.find((d) => dateOfDay(weekStart, d) === mv.toDate) : undefined
  if (!mv || day === undefined) return { ...slot, date, moved: false }
  return { day, start: mv.start, end: mv.end, date, moved: true }
}

/** כל מה שתופס זמן בשבוע: שיעורים שלא בוטלו (משבצת בחירה תופסת זמן גם לפני שבחרתי) ואירועים */
export function busyForWeek(data: ScheduleData, weekStart: Date): Busy[] {
  const lessons = new Map(data.lessons.map((l) => [l.id, l]))
  const out: Busy[] = []
  for (const e of data.entries) {
    const { date, moved: _m, ...slot } = placeOf(data, e.id, e.slot, weekStart)
    if (isCancelled(data, e.id, date) || !activeOn(lessons.get(e.lessonId), date, data.semesters)) continue
    const name = lessons.get(e.lessonId)?.name ?? ''
    out.push({ ...slot, label: name, kind: 'lesson', names: [name], kinds: [e.kind] })
  }
  for (const g of data.choiceGroups) {
    const { date, moved: _m, ...slot } = placeOf(data, g.id, g.slot, weekStart)
    if (isCancelled(data, g.id, date)) continue
    const ids = (g.chosenLessonId ? [g.chosenLessonId] : g.optionLessonIds).filter((id) =>
      activeOn(lessons.get(id), date, data.semesters),
    )
    if (!ids.length) continue
    const names = ids.map((id) => lessons.get(id)?.name ?? '')
    out.push({ ...slot, label: names.join(' / '), kind: 'lesson', names, kinds: ids.map((id) => g.kinds?.[id]) })
  }
  for (const ev of data.events) {
    const day = DAYS_OF_WEEK.find((d) => dateOfDay(weekStart, d) === ev.date)
    if (day === undefined) continue
    out.push({ day, start: ev.start, end: ev.end, label: ev.title, kind: 'event' })
  }
  return out
}

const DAYS_OF_WEEK: DayIndex[] = [0, 1, 2, 3, 4, 5, 6]

function subtract(free: Interval[], cut: Interval): Interval[] {
  const out: Interval[] = []
  for (const f of free) {
    if (cut.end <= f.start || cut.start >= f.end) out.push(f)
    else {
      if (cut.start > f.start) out.push({ start: f.start, end: cut.start })
      if (cut.end < f.end) out.push({ start: cut.end, end: f.end })
    }
  }
  return out
}

export interface FreeOptions {
  /** YYYY-MM-DD: ימים שעברו לא מתוכננים */
  today?: string
  /** דקות מחצות: היום לא מתכננים לפני עכשיו (חוץ ממפגש שהתחיל בחצי השעה האחרונה) */
  nowMin?: Minutes
}

/** כמה זמן אחורה מפגש שכבר התחיל עדיין נשאר במקומו, כדי שהלוח לא יקפוץ באמצע */
const GRACE = 30

/**
 * הזמן הפנוי בכל יום, והזמן שנשמר בצד. מה שתופס זמן:
 * שיעורים ואירועים (עם הפסקה לפני ואחרי), נסיעה לפני השיעור הראשון ואחרי האחרון,
 * שגרות (ארוחות, תפילות) במקום שנמצא להן, ומה שכבר עבר.
 */
export function weekFrame(
  data: ScheduleData,
  weekStart: Date,
  busy = busyForWeek(data, weekStart),
  opts: FreeOptions = {},
): { free: Interval[][]; reserved: Reserved[] } {
  const s = planSettings(data)
  const dates = DAYS_OF_WEEK.map((d) => dateOfDay(weekStart, d))
  const travel = s.travelMinutes ?? 0
  const reserved: Reserved[] = []

  // נסיעה: לפני השיעור הראשון ביום ואחרי האחרון. בין שיעורים נשארים במוסד
  if (travel > 0) {
    for (const day of DAYS_OF_WEEK) {
      const lessons = busy.filter((b) => b.day === day && b.kind === 'lesson')
      if (!lessons.length) continue
      const first = Math.min(...lessons.map((l) => l.start))
      const last = Math.max(...lessons.map((l) => l.end))
      reserved.push({ day, start: first - travel, end: first, label: 'נסיעה', kind: 'travel' })
      reserved.push({ day, start: last, end: last + travel, label: 'נסיעה', kind: 'travel' })
    }
  }

  // שגרות: מקום בתוך החלון, לא על שיעור, אירוע או נסיעה
  const routines = s.routines ?? []
  if (routines.length) {
    const placed: PlacedRoutine[] = placeRoutines(
      routines,
      dates,
      (day) => [...busy, ...reserved].filter((b) => b.day === day),
      s.location,
      (day) => isChag(dates[day]),
      { start: s.dayStart, end: s.dayEnd },
    )
    for (const r of placed) {
      reserved.push({ day: r.day, start: r.start, end: r.end, label: r.name, kind: 'routine', routineId: r.routineId })
    }
  }

  const free = DAYS_OF_WEEK.map((day) => {
    const date = dates[day]
    if (s.offDays.includes(day) || isChag(date)) return []
    if (opts.today && date < opts.today) return []
    // שישי וערב חג: היום נגמר מוקדם
    const early = (day === 5 || isErev(date)) && s.fridayEnd !== null
    const end = early ? Math.min(s.dayEnd, s.fridayEnd!) : s.dayEnd
    let start = s.dayStart
    if (opts.today && date === opts.today && opts.nowMin !== undefined) start = Math.max(start, opts.nowMin - GRACE)
    let free: Interval[] = end > start ? [{ start, end }] : []
    for (const b of busy.filter((b) => b.day === day)) {
      free = subtract(free, { start: b.start - s.breakMinutes, end: b.end + s.breakMinutes })
    }
    for (const r of reserved.filter((r) => r.day === day)) {
      // אחרי נסיעה עוד הפסקה קצרה; שגרה היא כבר הפסקה בעצמה
      const pad = r.kind === 'travel' ? s.breakMinutes : 0
      free = subtract(free, { start: r.start - pad, end: r.end + pad })
    }
    return free
  })
  return { free, reserved }
}

/** הזמן הפנוי בכל יום, אחרי השיעורים, האירועים, ההפסקות, הנסיעות והשגרות */
export function freeTime(
  data: ScheduleData,
  weekStart: Date,
  busy = busyForWeek(data, weekStart),
  opts: FreeOptions = {},
): Interval[][] {
  return weekFrame(data, weekStart, busy, opts).free
}

/** אותו מקצוע: כתיב שונה ושמות קצת שונים נחשבים אותו דבר ("פיסיקה" = "פיזיקה") */
const sameName = (a: string, b: string) => a.trim() === b.trim() || sameSubject(a, b)
/** האם בשיבוץ לומדים את המקצוע (במשבצת בחירה שלא נבחרה: אחת האפשרויות) */
const teaches = (b: Busy, subject: string) => (b.names ?? [b.label]).some((n) => sameName(n, subject))
/** סוג השיעור במקצוע הזה בשיבוץ, אם ידוע */
const lessonKindOf = (b: Busy, subject: string) => {
  const i = (b.names ?? [b.label]).findIndex((n) => sameName(n, subject))
  return i >= 0 ? b.kinds?.[i] : undefined
}
const start9 = (t: Minutes) => t < 9 * 60

interface Candidate {
  day: DayIndex
  start: Minutes
  score: number
  reasons: string[]
}

/**
 * יעד עם תאריך יעד: כמה שעות לתכנן השבוע. מה שנשאר (סך השעות פחות מה שסומן לפני השבוע)
 * מתחלק שווה על ימי התכנון שנשארו עד התאריך, והשבוע מקבל את החלק של הימים שלו.
 */
export function deadlineTarget(
  data: ScheduleData,
  g: Goal,
  weekStart: Date,
  today?: string,
): { weekly: number; remaining: Minutes; passed: boolean; buffer?: string } {
  const s = planSettings(data)
  const first = dateOfDay(weekStart, 0)
  const logged = (data.log ?? []).filter((l) => l.goalId === g.id)
  const minutes = (list: typeof logged) => list.reduce((m, l) => m + l.end - l.start, 0)
  const remaining = Math.max(0, (g.totalHours ?? 0) * 60 - minutes(logged.filter((l) => l.date < first)))
  const deadline = g.deadline!
  const passed = deadline < first
  if (passed || remaining <= 0) return { weekly: 0, remaining, passed }
  // באמצע השבוע: מה שכבר בוצע השבוע נשאר, והשאר מתחלק מהיום והלאה
  const from = today && today > first ? today : first
  const doneThisWeek = minutes(logged.filter((l) => l.date >= first && l.date < from))
  const left = Math.max(0, remaining - doneThisWeek)
  // ימי תכנון מ-from ועד התאריך
  const last = dateOfDay(weekStart, 6)
  const days: string[] = []
  for (let i = 0; i < 3660; i++) {
    const date = dateOfDay(weekStart, i)
    if (date > deadline) break
    if (date < from) continue
    const dow = (i % 7) as DayIndex
    if (s.offDays.includes(dow) || isChag(date)) continue
    days.push(date)
  }
  if (!days.length) return { weekly: doneThisWeek / 60, remaining, passed }
  // יום ביטחון: כשיש מספיק ימים, מתכננים לסיים יום לפני התאריך. בלת"מ לא יפיל את ההגשה
  const buffer = days.length >= 4 ? days.pop() : undefined
  const thisWeek = days.filter((d) => d <= last).length
  // מעגלים כלפי מעלה לרבע שעה, כדי לא להישאר מאחור
  const weekly = Math.ceil(((doneThisWeek + (left * thisWeek) / days.length) / 60) * 4) / 4
  return { weekly, remaining, passed, ...(buffer ? { buffer } : {}) }
}

/**
 * מתכנן שבוע: קודם החזרות המרווחות (יש להן תאריך), אחר כך המינימום של כל יעד, ואז, אם יש מקומות טובים, עד המקסימום.
 * today (YYYY-MM-DD): חזרה שהתאריך שלה עבר ולא בוצעה נדחית להיום, ולא נעלמת.
 */
export function planWeek(data: ScheduleData, weekStart: Date, today?: string, nowMin?: Minutes): WeekPlan {
  const s = planSettings(data)
  const weekDateList = DAYS_OF_WEEK.map((d) => dateOfDay(weekStart, d))
  // יעד עם תאריך יעד: פעיל עד התאריך (כולל), כל עוד נשארו שעות
  const goalList = allGoals(data)
  const deadlines = new Map(
    goalList.filter((g) => g.deadline && g.totalHours).map((g) => [g.id, deadlineTarget(data, g, weekStart, today)]),
  )
  const goals = goalList.filter((g) => {
    const d = deadlines.get(g.id)
    if (d) return d.weekly > 0
    return g.maxHoursPerWeek > 0 || g.minHoursPerWeek > 0
  })
  const busy = busyForWeek(data, weekStart)
  const frame = weekFrame(data, weekStart, busy, { today, nowMin })
  /** הזמן הפנוי לפני שיבוץ המפגשים. free מחושב ממנו מחדש בכל שינוי */
  const baseFree = frame.free
  const free = baseFree.map((f) => [...f])
  /** דקות שיעור בכל יום: חלק מהעומס היומי */
  const lessonMinutes = DAYS_OF_WEEK.map((d) =>
    busy.filter((b) => b.day === d && b.kind === 'lesson').reduce((m, b) => m + b.end - b.start, 0),
  )
  const maxLoad = (s.maxLoadPerDay ?? DEFAULT_MAX_LOAD) * 60
  const lessonsByDay = DAYS_OF_WEEK.map((d) => busy.filter((b) => b.day === d && b.kind === 'lesson'))
  const practice = (data.practiceWindows ?? [])
    .filter((w) => !isCancelled(data, w.id, dateOfDay(weekStart, w.slot.day)))
    .map((w) => {
      const { date: _d, moved: _m, ...slot } = placeOf(data, w.id, w.slot, weekStart)
      return { ...w, slot }
    })
  const prefs = learnedPrefs(data)
  /** "לא מתאים לי כאן": לא לשבץ את היעד בסביבה של שעה לפני ואחרי */
  const skips = (data.planSkips ?? []).filter((x) => weekDateList.includes(x.date))
  const skipped = (goalId: string, day: DayIndex, start: Minutes, end: Minutes) =>
    skips.some(
      (x) => x.goalId === goalId && x.date === weekDateList[day] && start < x.end + 60 && end > x.start - 60,
    )

  const sessions: PlannedSession[] = []
  /** הזמן הפנוי ביום: הבסיס פחות כל המפגשים, עם הפסקה סביבם */
  const rebuild = (day: DayIndex) => {
    let f = baseFree[day]
    for (const x of sessions) if (x.day === day) f = subtract(f, { start: x.start - s.breakMinutes, end: x.end + s.breakMinutes })
    free[day] = f
  }

  // מה שכבר בוצע השבוע נשאר במקומו, והתכנון משלים סביבו
  for (const l of data.log ?? []) {
    const day = DAYS_OF_WEEK.find((d) => dateOfDay(weekStart, d) === l.date)
    if (day === undefined || !goals.some((g) => g.id === l.goalId)) continue
    sessions.push({
      id: l.id,
      logId: l.id,
      goalId: l.goalId,
      day,
      start: l.start,
      end: l.end,
      reasons: [l.reviewId ? 'סימנת שחזרת' : 'סימנת שתרגלת'],
      done: true,
      ...(l.reviewId ? { reviewId: l.reviewId, title: `חזרה: ${l.topic ?? ''}` } : {}),
    })
  }
  // מפגשים שהזזתי בגרירה נשארים במקום החדש, אלא אם כבר סימנתי שתרגלתי אותם
  const logged = sessions.filter((x) => x.done)
  const pinnedReviews = new Set<string>()
  for (const p of data.planPins ?? []) {
    const day = DAYS_OF_WEEK.find((d) => dateOfDay(weekStart, d) === p.date)
    if (day === undefined || !goals.some((g) => g.id === p.goalId)) continue
    if (logged.some((x) => x.goalId === p.goalId && x.day === day && x.start < p.end && x.end > p.start)) continue
    if (p.reviewId && logged.some((x) => x.reviewId === p.reviewId)) continue
    const review = p.reviewId ? (data.reviews ?? []).find((r) => r.id === p.reviewId) : undefined
    if (p.reviewId && !review) continue
    if (review) pinnedReviews.add(review.id)
    const [, m, d] = p.fromDate.split('-')
    sessions.push({
      id: `pin-${p.id}`,
      pinId: p.id,
      goalId: p.goalId,
      day,
      start: p.start,
      end: p.end,
      reasons: [`הזזת לכאן (התכנון שם אותו ב-${Number(d)}.${Number(m)}, ${formatTime(p.fromStart)})`],
      ...(review ? { reviewId: review.id, title: `חזרה: ${review.topic}` } : {}),
    })
  }
  for (const day of DAYS_OF_WEEK) rebuild(day)

  const minutesOf = (goalId: string) =>
    sessions.filter((x) => x.goalId === goalId).reduce((m, x) => m + x.end - x.start, 0)
  const dayLoad = (day: DayIndex) => sessions.filter((x) => x.day === day).reduce((m, x) => m + x.end - x.start, 0)

  // מבחן קרוב במקצוע: היעד גדל פי 1.5 (מעוגל לחצי שעה)
  const boosts = new Map<string, { factor: number; note: string; exams: { date: string }[] }>()
  for (const g of goals) {
    if (!g.subject) continue
    const exams = upcomingExams(data, g.subject, weekStart)
    if (!exams.length) continue
    const [y, m, d] = exams[0].date.split('-')
    boosts.set(g.id, { factor: 1.5, note: `לקראת המבחן ב-${Number(d)}.${Number(m)}.${y}`, exams })
  }
  // יעד עם תאריך יעד: המינימום והמקסימום הם החלק של השבוע מהשעות שנשארו
  const baseMin = (g: Goal) => deadlines.get(g.id)?.weekly ?? g.minHoursPerWeek
  const baseMax = (g: Goal) => deadlines.get(g.id)?.weekly ?? g.maxHoursPerWeek
  const minOf = (g: Goal) => Math.round(baseMin(g) * (boosts.get(g.id)?.factor ?? 1) * 2) / 2
  const maxOf = (g: Goal) =>
    Math.max(minOf(g), Math.round(baseMax(g) * (boosts.get(g.id)?.factor ?? 1) * 2) / 2)

  const lengthOf = (g: Goal, target: Minutes) => {
    const len = sessionLength(g)
    const left = target - minutesOf(g.id)
    // השארית האחרונה יכולה להיות קצרה יותר, אבל לא פחות מחצי שעה
    return Math.max(30, Math.min(len, left))
  }

  const goalName = new Map(goals.map((g) => [g.id, g.name]))
  const sharp = s.sharpFrom !== undefined && s.sharpTo !== undefined && s.sharpTo > s.sharpFrom
  const inSharp = (start: Minutes, end: Minutes) => sharp && start >= s.sharpFrom! && end <= s.sharpTo!
  const goalMinutesOn = (goalId: string, day: DayIndex) =>
    sessions.filter((x) => x.day === day && x.goalId === goalId).reduce((m, x) => m + x.end - x.start, 0)

  /** כללי מנוע הלמידה: פיזור, ערבוב, שעות חדות ובלוק רצוף. לא חל על יעד בלי סוג */
  const learningScore = (g: Goal, day: DayIndex, start: Minutes, end: Minutes, f: Interval) => {
    let sc = 0
    const reasons: string[] = []
    if (!g.kind) return { sc, reasons }
    const mine = sessions.filter((x) => x.goalId === g.id)
    const near = mine.some((x) => Math.abs(x.day - day) === 1)
    if (near) sc -= 1
    else if (mine.some((x) => x.day !== day)) reasons.push('יום הפסקה מהמפגש הקודם (פיזור בזמן משפר זכירה)')

    const sameDay = sessions.filter((x) => x.day === day)
    const touching = (x: PlannedSession) => x.end + s.breakMinutes === start || end + s.breakMinutes === x.start
    if (sameDay.some((x) => x.goalId === g.id && touching(x))) sc -= 3
    const other = sameDay.find((x) => x.goalId !== g.id && !x.reviewId)
    if (other) {
      sc += 1
      reasons.push(`ערבוב: באותו יום גם ${goalName.get(other.goalId) ?? ''}`)
    }
    if (inSharp(start, end)) {
      sc += 2
      reasons.push('בשעות שבהן אתה חד: למידה קשה בשעות הטובות')
    }
    if (g.kind === 'creative' && f.end - f.start >= end - start + 60) {
      sc += 2
      reasons.push('רצף ארוך בלי הפרעות לעבודה עמוקה')
    }
    return { sc, reasons }
  }

  const score = (g: Goal, day: DayIndex, start: Minutes, len: Minutes, f: Interval): Candidate | null => {
    const end = start + len
    if (g.days?.length && !g.days.includes(day)) return null
    if (g.earliest !== undefined && start < g.earliest) return null
    if (g.latest !== undefined && end > g.latest) return null
    const dl = deadlines.get(g.id)
    if (dl && weekDateList[day] > g.deadline!) return null
    if (lessonMinutes[day] + dayLoad(day) + len > maxLoad) return null
    const today = sessions.filter((x) => x.day === day && x.goalId === g.id && !x.reviewId).length
    if (today >= maxPerDay(g)) return null
    if (dayLoad(day) + len > s.maxHoursPerDay * 60) return null
    // מעבר לתקרה היומית של הסוג, תרגול נוסף באותו יום כבר לא מועיל
    if (g.kind && goalMinutesOn(g.id, day) + len > KINDS[g.kind].dailyCap) return null
    if (skipped(g.id, day, start, end)) return null

    const learn = learningScore(g, day, start, end, f)
    const pref = prefScore(prefs, g.id, day, start)
    let sc = learn.sc + pref.sc
    const reasons: string[] = [...pref.reasons]

    const inPractice = practice.find((w) => w.slot.day === day && w.slot.start <= start && end <= w.slot.end)
    if (inPractice) {
      // חלונות התרגול שמורים ללימוד: יעד של מקצוע מקבל עדיפות, יעד אחר (אימון) רק אם אין ברירה
      if (g.preferPractice || g.subject) {
        sc += g.preferPractice ? 5 : 2
        reasons.push(`בחלון ${inPractice.name}${inPractice.context ? ` של ${inPractice.context}` : ''}`)
      } else {
        sc -= 2
      }
    }
    if (g.preferredWindows.some((w) => w.day === day && w.start <= start && end <= w.end)) {
      sc += 3
      reasons.push('בשעות שהעדפת')
    }

    if (g.subject) {
      const sub = g.subject
      const before = lessonsByDay[day].filter((l) => teaches(l, sub) && l.end <= start)
      const tomorrow = lessonsByDay[(day + 1) % 7].filter((l) => teaches(l, sub))
      const laterToday = lessonsByDay[day].filter((l) => teaches(l, sub) && l.start >= end)
      /** "שיעור", "הרצאה", "תרגול" */
      const what = (b: Busy) => lessonKindOf(b, sub) ?? 'שיעור'
      // לפני תרגול או מעבדה: לנסות לבד קודם, כדי להגיע עם שאלות. אחרי הרצאה: לעבד את החומר בזמן שהוא טרי
      const prepBonus = (b: Busy) => {
        const k = lessonKindOf(b, sub)
        if (k === 'תרגול') return { sc: 2, why: 'כדאי לנסות תרגילים לבד לפני התרגול, ולהגיע עם שאלות' }
        if (k === 'מעבדה') return { sc: 2, why: 'כדאי לקרוא את הניסוי לפני המעבדה' }
        return null
      }
      if (before.length) {
        const last = before[before.length - 1]
        // חזרה בזמן שהחומר טרי: ככל שקרוב יותר לשיעור, טוב יותר
        sc += start - last.end <= 4 * 60 ? 4 : 2
        reasons.push(`חזרה אחרי ${what(last)} ב${sub} שנגמר${what(last) === 'שיעור' ? '' : 'ה'} ב-${formatTime(last.end)}`)
        // אחרי תרגול כבר תרגלת: עדיף להתכונן לפני התרגול מאשר לחזור עליו
        if (lessonKindOf(last, sub) === 'תרגול') sc -= 2
        if (lessonKindOf(last, sub) === 'הרצאה') {
          sc += 1
          reasons.push('עיבוד של ההרצאה באותו יום, לפני שהחומר נשכח')
        }
      } else if (laterToday.length) {
        sc += 2
        reasons.push(`הכנה ל${what(laterToday[0])} ב${sub} ב-${formatTime(laterToday[0].start)}`)
        const prep = prepBonus(laterToday[0])
        if (prep) {
          sc += prep.sc
          reasons.push(prep.why)
        }
      }
      if (tomorrow.length && day !== 6) {
        sc += 3
        reasons.push(`הכנה ל${what(tomorrow[0])} ב${sub} מחר (${DAY_NAMES[(day + 1) % 7]})`)
        const prep = prepBonus(tomorrow[0])
        if (prep && !reasons.includes(prep.why)) {
          sc += prep.sc
          reasons.push(prep.why)
        }
      }
      // יום בלי שיעור במקצוע ובלי שיעור מחר: עדיין אפשרי, אבל פחות שימושי
    }

    // מבחן קרוב: ככל שקרוב יותר למבחן (יום עד שלושה לפני), עדיף
    const boost = boosts.get(g.id)
    if (boost) {
      const date = dateOfDay(weekStart, day)
      for (const ex of boost.exams) {
        const left = dayDiff(date, ex.date)
        if (left >= 1 && left <= 3) {
          sc += 5 - left
          reasons.push(left === 1 ? 'יום לפני המבחן' : `${left} ימים לפני המבחן`)
          break
        }
      }
    }

    // פיזור: עדיף יום שעוד אין בו מפגש של היעד הזה, וגם לא ביום שאחרי מפגש קודם
    if (today > 0) sc -= 4
    if (sessions.some((x) => x.goalId === g.id && x.day === day - 1)) sc -= 1

    // צמוד לשיעור או למפגש (אחרי הפסקה) עדיף על פני חור באמצע היום
    const snug = busy
      .filter((b) => b.day === day)
      .concat(sessions.filter((x) => x.day === day).map((x) => ({ ...x, label: '', kind: 'lesson' as const })))
      .some((b) => b.end + s.breakMinutes === start || end + s.breakMinutes === b.start)
    if (snug) sc += 1

    if (end > 22 * 60) sc -= 2
    if (start < 9 * 60) sc -= 1

    // עומס: יום עמוס בשיעורים ובמפגשים פחות מתאים לעוד למידה (מעל 6 שעות, נקודה לכל שעתיים)
    const load = lessonMinutes[day] + dayLoad(day)
    if (load > 6 * 60) sc -= (load - 6 * 60) / 120
    else if (lessonMinutes[day] === 0 && dayLoad(day) === 0) sc += 0.5

    // תאריך יעד: ככל שקרוב יותר לתאריך, פחות מרווח לטעויות. עדיף מוקדם, ויום הביטחון רק אם אין ברירה
    if (dl) sc -= day * 0.2
    if (dl?.buffer === weekDateList[day]) {
      sc -= 6
      reasons.push('יום הביטחון לפני תאריך היעד: רק כי לא נמצא מקום אחר')
    }

    if (pref.avoided) reasons.push('בדרך כלל אתה מזיז מכאן, אבל לא נמצא מקום מתאים יותר')
    return { day, start, score: sc, reasons: [...reasons, ...learn.reasons] }
  }

  const place = (g: Goal, target: Minutes, minScore: number): boolean => {
    const len = lengthOf(g, target)
    let best: Candidate | null = null
    for (const day of DAYS_OF_WEEK) {
      for (const f of free[day]) {
        for (let t = Math.ceil(f.start / STEP) * STEP; t + len <= f.end; t += STEP) {
          const c = score(g, day, t, len, f)
          if (!c) continue
          if (!best || c.score > best.score) best = c
        }
      }
    }
    if (!best || best.score < minScore) return false
    let n = sessions.filter((x) => x.goalId === g.id).length + 1
    while (sessions.some((x) => x.id === `plan-${g.id}-${n}`)) n++
    sessions.push({
      id: `plan-${g.id}-${n}`,
      goalId: g.id,
      day: best.day,
      start: best.start,
      end: best.start + len,
      reasons: best.reasons.length ? best.reasons : ['בזמן פנוי'],
    })
    rebuild(best.day)
    return true
  }

  // חזרות מרווחות: ביום שלהן, או בימים שאחריו אם אין מקום. חזרה שעבר זמנה נדחית ולא נעלמת
  const weekDates = DAYS_OF_WEEK.map((d) => dateOfDay(weekStart, d))
  const pending = (data.reviews ?? [])
    // אחרי שחוזרים, החזרה כבר מתקדמת לתאריך הבא, כך שכל מה שנשאר כאן עוד לא בוצע
    .filter((r) => goals.some((g) => g.id === r.goalId) && !pinnedReviews.has(r.id))
    .map((r) => {
      let due = r.due
      if (today && due < today) due = today
      return { r, due }
    })
    .filter(({ due }) => due >= weekDates[0] && due <= weekDates[6])
    .sort((a, b) => a.due.localeCompare(b.due) || a.r.step - b.r.step)
  const reviewsOn = (day: DayIndex) => sessions.filter((x) => x.reviewId && x.day === day).length
  for (const { r, due } of pending) {
    const g = goals.find((x) => x.id === r.goalId)!
    const first = weekDates.indexOf(due)
    let best: (Candidate & { late: number }) | null = null
    let full = false
    for (const day of DAYS_OF_WEEK.slice(first)) {
      // תקרה לחזרות ביום: כשנלמדו הרבה נושאים, החזרות מתפזרות על הימים הבאים ולא נערמות
      if (reviewsOn(day) >= MAX_REVIEWS_PER_DAY) {
        if (day === first) full = true
        continue
      }
      if (dayLoad(day) + REVIEW_MINUTES > s.maxHoursPerDay * 60) continue
      if (lessonMinutes[day] + dayLoad(day) + REVIEW_MINUTES > maxLoad) continue
      if (g.days?.length && !g.days.includes(day)) continue
      for (const f of free[day]) {
        for (let t = Math.ceil(f.start / STEP) * STEP; t + REVIEW_MINUTES <= f.end; t += STEP) {
          const end = t + REVIEW_MINUTES
          if (g.earliest !== undefined && t < g.earliest) continue
          if (g.latest !== undefined && end > g.latest) continue
          if (skipped(g.id, day, t, end)) continue
          // אותו יום עדיף מאוד; תרגול קל עדיף מחוץ לשעות החדות; לא מאוחר בלילה; ולפי ההעדפות שנלמדו
          let sc = -(day - first) * 3 + prefScore(prefs, g.id, day, t).sc - reviewsOn(day)
          if (sharp && !inSharp(t, end)) sc += 1
          if (end > 22 * 60) sc -= 2
          if (start9(t)) sc -= 1
          if (!best || sc > best.score) best = { day, start: t, score: sc, reasons: [], late: day - first }
        }
      }
    }
    if (!best) continue
    const reasons = [
      `חזרה ${r.step + 1} על "${r.topic}", ${intervalText(INTERVALS[r.step])} (חזרה מרווחת)`,
      'שליפה מהזיכרון אחרי הפסקה מחזקת את הזיכרון יותר מעוד קריאה',
    ]
    if (r.due < due || best.late > 0) {
      const [, m, d] = r.due.split('-')
      reasons.push(
        full && r.due >= due
          ? `נדחתה מ-${Number(d)}.${Number(m)} כי כבר היו שם ${MAX_REVIEWS_PER_DAY} חזרות (יום או יומיים אחרי עדיין עובד)`
          : `נדחתה מ-${Number(d)}.${Number(m)}, ולא נעלמה`,
      )
    }
    sessions.push({
      id: `review-${r.id}`,
      goalId: g.id,
      reviewId: r.id,
      title: `חזרה: ${r.topic}`,
      day: best.day,
      start: best.start,
      end: best.start + REVIEW_MINUTES,
      reasons,
    })
    rebuild(best.day)
  }

  // שלב 1: מינימום. סבב בין היעדים, כדי שאף יעד לא יתפוס את כל המקומות הטובים.
  // יעדים שהגדרתי בוחרים קודם; התרגול האוטומטי של שאר המקצועות מקבל את מה שנשאר
  const mine = goals.filter((g) => !g.auto)
  const auto = goals.filter((g) => g.auto)
  const fill = (targetOf: (g: Goal) => Minutes, minScore: number, list: Goal[]) => {
    const active = new Set(list.map((g) => g.id))
    while (active.size) {
      for (const g of list) {
        if (!active.has(g.id)) continue
        const target = targetOf(g)
        if (minutesOf(g.id) >= target || !place(g, target, minScore)) active.delete(g.id)
      }
    }
  }
  fill((g) => minOf(g) * 60, -Infinity, mine)
  fill((g) => minOf(g) * 60, -Infinity, auto)

  // תיקון: יעד שלא הגיע למינימום מקבל מקום של מפגש של יעד אחר, אם אותו מפגש יכול לעבור למקום אחר
  // והיעד האחר לא יורד מתחת למינימום שלו. כך אף יעד לא נשאר חסר רק בגלל סדר השיבוץ
  const rearranged = new Map<string, number>()
  for (const g of goals) {
    for (let tries = 0; tries < 12 && minutesOf(g.id) < minOf(g) * 60; tries++) {
      // יעד אוטומטי לא מזיז מפגשים של יעד שהגדרתי
      const movable = sessions.filter(
        (x) =>
          x.goalId !== g.id && !x.done && !x.pinId && !x.reviewId && (!g.auto || !!goals.find((o) => o.id === x.goalId)?.auto),
      )
      let fixed = false
      for (const x of movable) {
        const other = goals.find((o) => o.id === x.goalId)
        if (!other) continue
        const before = minutesOf(other.id)
        const otherNeed = Math.min(before, minOf(other) * 60)
        const snapshot = sessions.slice()
        sessions.splice(sessions.indexOf(x), 1)
        rebuild(x.day)
        if (place(g, minOf(g) * 60, -Infinity)) {
          // היעד האחר משלים את מה שאיבד, לפחות עד המינימום שלו
          while (minutesOf(other.id) < otherNeed && place(other, otherNeed, -Infinity));
          if (minutesOf(other.id) >= otherNeed) {
            fixed = true
            const moved = sessions.find((y) => y.goalId === other.id && !snapshot.includes(y))
            if (moved) moved.reasons = [...moved.reasons, `הוזז כדי לפנות מקום ל${g.name}`]
            rearranged.set(g.id, (rearranged.get(g.id) ?? 0) + 1)
            break
          }
        }
        sessions.splice(0, sessions.length, ...snapshot)
        for (const day of DAYS_OF_WEEK) rebuild(day)
      }
      if (!fixed) break
      // אחרי תיקון אחד, אולי נפתח מקום רגיל להמשך
      while (minutesOf(g.id) < minOf(g) * 60 && place(g, minOf(g) * 60, -Infinity));
    }
  }

  // שלב 2: עד המקסימום, רק במקומות שבאמת מתאימים
  fill((g) => maxOf(g) * 60, 3, mine)
  fill((g) => maxOf(g) * 60, 3, auto)

  // מה שפוספס: התכנון של השבוע כאילו מתחילתו, במה שכבר עבר ולא סומן. מוצג כדי שאפשר יהיה לסמן שבוצע בכל זאת
  const missed: PlannedSession[] = []
  if (today && today >= weekDateList[0]) {
    const isPast = (x: PlannedSession) =>
      weekDateList[x.day] < today || (weekDateList[x.day] === today && nowMin !== undefined && x.end <= nowMin - GRACE)
    const reference = planWeek(data, weekStart)
    for (const x of reference.sessions) {
      if (x.done || x.pinId || x.reviewId || !isPast(x)) continue
      const owner = goals.find((g) => g.id === x.goalId)
      // יעד אוטומטי לא ביקשתי, ולכן לא מציגים בו פספוסים
      if (owner?.auto) continue
      const since = owner?.since
      // גם ביום שבו נוצר: מה שתוכנן לפני השעה שבה נוצר הוא לא פספוס
      if (since && weekDateList[x.day] <= since) continue
      // אם בפועל יש במקום הזה מפגש שסומן, לא מציגים פספוס
      if (sessions.some((y) => y.day === x.day && y.start < x.end && x.start < y.end)) continue
      missed.push({
        ...x,
        id: `missed-${x.id}`,
        missed: true,
        reasons: ['הזמן עבר ולא סומן שתרגלת. התכנון השלים את זה בהמשך השבוע. אם תרגלת בכל זאת, אפשר לסמן'],
      })
    }
  }

  sessions.sort((a, b) => a.day - b.day || a.start - b.start)
  const all = [...sessions, ...missed].sort((a, b) => a.day - b.day || a.start - b.start)
  return {
    sessions: all,
    report: goals.map((g) => ({
      goalId: g.id,
      name: g.name,
      planned: minutesOf(g.id),
      done: sessions.filter((x) => x.goalId === g.id && x.done).reduce((m, x) => m + x.end - x.start, 0),
      min: minOf(g) * 60,
      max: maxOf(g) * 60,
      boost: boosts.get(g.id)?.note,
      reviews: sessions.filter((x) => x.goalId === g.id && x.reviewId).length,
      reviewsDone: sessions.filter((x) => x.goalId === g.id && x.reviewId && x.done).length,
      ...(deadlines.get(g.id)
        ? {
            deadline: {
              date: g.deadline!,
              remainingHours: deadlines.get(g.id)!.remaining / 60,
              passed: deadlines.get(g.id)!.passed,
              buffer: deadlines.get(g.id)!.buffer,
            },
          }
        : {}),
      ...(rearranged.get(g.id) ? { rearranged: rearranged.get(g.id) } : {}),
      missed: missed.filter((x) => x.goalId === g.id).reduce((m, x) => m + x.end - x.start, 0),
    })),
    reserved: frame.reserved,
  }
}

/** שמות המקצועות במערכת, לבחירת המקצוע של יעד */
export const subjectNames = (lessons: Lesson[]) =>
  [...new Set(lessons.filter((l) => !l.personal).map((l) => l.name.trim()))].sort((a, b) => a.localeCompare(b, 'he'))
