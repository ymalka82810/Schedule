import type { DayIndex, Goal, Lesson, Minutes, PlanSettings, ScheduleData } from '../types'
import { DAY_NAMES, dateOfDay, formatTime } from './time'
import { isChag, isErev } from './hebrew'

/**
 * תכנון הזמן הפנוי (שלב 4). לכל שבוע מחשבים מחדש איפה לשבץ את היעדים הגמישים:
 * רק בזמן פנוי, עם הפסקות, בלי שבת, ולפי מה שבאמת עוזר ללמידה: תרגול אחרי השיעור
 * או ערב לפני השיעור הבא, פיזור על פני השבוע, וחלונות התרגול (מיגו) קודם.
 * כל שיבוץ מגיע עם הסבר למה הוא שם.
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

/** משהו שתופס זמן בשבוע מסוים */
export interface Busy {
  day: DayIndex
  start: Minutes
  end: Minutes
  label: string
  kind: 'lesson' | 'event'
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
}

export interface WeekPlan {
  sessions: PlannedSession[]
  report: GoalReport[]
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
export const activeOn = (l: Lesson | undefined, date: string) =>
  !!l && (!l.validFrom || date >= l.validFrom) && (!l.validUntil || date <= l.validUntil)

/** כל מה שתופס זמן בשבוע: שיעורים שלא בוטלו (משבצת בחירה תופסת זמן גם לפני שבחרתי) ואירועים */
export function busyForWeek(data: ScheduleData, weekStart: Date): Busy[] {
  const lessons = new Map(data.lessons.map((l) => [l.id, l]))
  const out: Busy[] = []
  for (const e of data.entries) {
    const date = dateOfDay(weekStart, e.slot.day)
    if (isCancelled(data, e.id, date) || !activeOn(lessons.get(e.lessonId), date)) continue
    out.push({ ...e.slot, label: lessons.get(e.lessonId)?.name ?? '', kind: 'lesson' })
  }
  for (const g of data.choiceGroups) {
    const date = dateOfDay(weekStart, g.slot.day)
    if (isCancelled(data, g.id, date)) continue
    const ids = (g.chosenLessonId ? [g.chosenLessonId] : g.optionLessonIds).filter((id) =>
      activeOn(lessons.get(id), date),
    )
    if (!ids.length) continue
    out.push({ ...g.slot, label: ids.map((id) => lessons.get(id)?.name ?? '').join(' / '), kind: 'lesson' })
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

/** הזמן הפנוי בכל יום, אחרי השיעורים, האירועים וההפסקות סביבם */
export function freeTime(data: ScheduleData, weekStart: Date, busy = busyForWeek(data, weekStart)): Interval[][] {
  const s = planSettings(data)
  return DAYS_OF_WEEK.map((day) => {
    const date = dateOfDay(weekStart, day)
    if (s.offDays.includes(day) || isChag(date)) return []
    // שישי וערב חג: היום נגמר מוקדם
    const early = (day === 5 || isErev(date)) && s.fridayEnd !== null
    const end = early ? Math.min(s.dayEnd, s.fridayEnd!) : s.dayEnd
    let free: Interval[] = end > s.dayStart ? [{ start: s.dayStart, end }] : []
    for (const b of busy.filter((b) => b.day === day)) {
      free = subtract(free, { start: b.start - s.breakMinutes, end: b.end + s.breakMinutes })
    }
    return free
  })
}

const sameName = (a: string, b: string) => a.trim() === b.trim()

interface Candidate {
  day: DayIndex
  start: Minutes
  score: number
  reasons: string[]
}

/** מתכנן שבוע: ממלא קודם את המינימום של כל יעד, ואז, אם יש מקומות טובים, עד המקסימום */
export function planWeek(data: ScheduleData, weekStart: Date): WeekPlan {
  const s = planSettings(data)
  const goals = data.goals.filter((g) => g.maxHoursPerWeek > 0 || g.minHoursPerWeek > 0)
  const busy = busyForWeek(data, weekStart)
  const free = freeTime(data, weekStart, busy)
  const lessonsByDay = DAYS_OF_WEEK.map((d) => busy.filter((b) => b.day === d && b.kind === 'lesson'))
  const practice = (data.practiceWindows ?? []).filter(
    (w) => !isCancelled(data, w.id, dateOfDay(weekStart, w.slot.day)),
  )

  const sessions: PlannedSession[] = []

  // מה שכבר בוצע השבוע נשאר במקומו, והתכנון משלים סביבו
  for (const l of data.log ?? []) {
    const day = DAYS_OF_WEEK.find((d) => dateOfDay(weekStart, d) === l.date)
    if (day === undefined || !goals.some((g) => g.id === l.goalId)) continue
    sessions.push({ id: l.id, goalId: l.goalId, day, start: l.start, end: l.end, reasons: ['סימנת שתרגלת'], done: true })
    free[day] = subtract(free[day], { start: l.start - s.breakMinutes, end: l.end + s.breakMinutes })
  }
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
  const minOf = (g: Goal) => Math.round(g.minHoursPerWeek * (boosts.get(g.id)?.factor ?? 1) * 2) / 2
  const maxOf = (g: Goal) =>
    Math.max(minOf(g), Math.round(g.maxHoursPerWeek * (boosts.get(g.id)?.factor ?? 1) * 2) / 2)

  const lengthOf = (g: Goal, target: Minutes) => {
    const len = g.sessionMinutes ?? 60
    const left = target - minutesOf(g.id)
    // השארית האחרונה יכולה להיות קצרה יותר, אבל לא פחות מחצי שעה
    return Math.max(30, Math.min(len, left))
  }

  const score = (g: Goal, day: DayIndex, start: Minutes, len: Minutes): Candidate | null => {
    const end = start + len
    if (g.days?.length && !g.days.includes(day)) return null
    if (g.earliest !== undefined && start < g.earliest) return null
    if (g.latest !== undefined && end > g.latest) return null
    const today = sessions.filter((x) => x.day === day && x.goalId === g.id).length
    if (today >= (g.maxPerDay ?? 1)) return null
    if (dayLoad(day) + len > s.maxHoursPerDay * 60) return null

    let sc = 0
    const reasons: string[] = []

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
      const before = lessonsByDay[day].filter((l) => sameName(l.label, sub) && l.end <= start)
      const tomorrow = lessonsByDay[(day + 1) % 7].filter((l) => sameName(l.label, sub))
      const laterToday = lessonsByDay[day].filter((l) => sameName(l.label, sub) && l.start >= end)
      if (before.length) {
        const last = before[before.length - 1]
        // חזרה בזמן שהחומר טרי: ככל שקרוב יותר לשיעור, טוב יותר
        sc += start - last.end <= 4 * 60 ? 4 : 2
        reasons.push(`חזרה אחרי שיעור ${sub} שנגמר ב-${formatTime(last.end)}`)
      } else if (laterToday.length) {
        sc += 2
        reasons.push(`הכנה לשיעור ${sub} ב-${formatTime(laterToday[0].start)}`)
      }
      if (tomorrow.length && day !== 6) {
        sc += 3
        reasons.push(`הכנה לשיעור ${sub} מחר (${DAY_NAMES[(day + 1) % 7]})`)
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

    return { day, start, score: sc, reasons }
  }

  const place = (g: Goal, target: Minutes, minScore: number): boolean => {
    const len = lengthOf(g, target)
    let best: Candidate | null = null
    for (const day of DAYS_OF_WEEK) {
      for (const f of free[day]) {
        for (let t = Math.ceil(f.start / STEP) * STEP; t + len <= f.end; t += STEP) {
          const c = score(g, day, t, len)
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
    free[best.day] = subtract(free[best.day], {
      start: best.start - s.breakMinutes,
      end: best.start + len + s.breakMinutes,
    })
    return true
  }

  // שלב 1: מינימום. סבב בין היעדים, כדי שאף יעד לא יתפוס את כל המקומות הטובים
  const fill = (targetOf: (g: Goal) => Minutes, minScore: number) => {
    const active = new Set(goals.map((g) => g.id))
    while (active.size) {
      for (const g of goals) {
        if (!active.has(g.id)) continue
        const target = targetOf(g)
        if (minutesOf(g.id) >= target || !place(g, target, minScore)) active.delete(g.id)
      }
    }
  }
  fill((g) => minOf(g) * 60, -Infinity)
  // שלב 2: עד המקסימום, רק במקומות שבאמת מתאימים
  fill((g) => maxOf(g) * 60, 3)

  sessions.sort((a, b) => a.day - b.day || a.start - b.start)
  return {
    sessions,
    report: goals.map((g) => ({
      goalId: g.id,
      name: g.name,
      planned: minutesOf(g.id),
      done: sessions.filter((x) => x.goalId === g.id && x.done).reduce((m, x) => m + x.end - x.start, 0),
      min: minOf(g) * 60,
      max: maxOf(g) * 60,
      boost: boosts.get(g.id)?.note,
    })),
  }
}

/** שמות המקצועות במערכת, לבחירת המקצוע של יעד */
export const subjectNames = (lessons: Lesson[]) =>
  [...new Set(lessons.filter((l) => !l.personal).map((l) => l.name.trim()))].sort((a, b) => a.localeCompare(b, 'he'))
