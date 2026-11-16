import type { Break, OneOffEvent, ScheduleData } from '../types'
import type { CalendarItem, YearCalendar } from './pdf/yearCalendar'
import { sameSubject } from './pdf/parseCell'
import { attendedSubjects } from './suggest'
import { newId } from './edit'
import { setSemesterDates } from './semester'

/**
 * ייבוא של לוח שנתי אל הלוח: מה חדש, מה כבר קיים, ומה השתנה מאז הייבוא הקודם.
 * אפשר להעלות גרסה מעודכנת של אותו קובץ שוב ושוב: שורה שכבר יובאה מזוהה לפי המזהה שלה,
 * ורק התאריך שלה מתעדכן. שורה שקיבלה תאריך רק בגרסה החדשה מתווספת.
 */

export type ChoiceStatus = 'new' | 'changed' | 'same' | 'undated'

export interface CalendarChoice {
  item: CalendarItem
  status: ChoiceStatus
  /** מה שיש עכשיו בלוח, כשהתאריך השתנה */
  was?: { from: string; to: string }
  /** החופשה או האירוע הקיימים שמתעדכנים */
  existingId?: string
  checked: boolean
  /** למבחן: המקצוע שלי שהוא שייך אליו */
  subject?: string
  /** המקצוע זוהה לפי דמיון חלקי ("כתיבה אקדמית" מול "כתיבה מדעית") */
  subjectGuess?: boolean
  /** למה לא מסומן מראש */
  reason?: string
}

export interface GoneItem {
  id: string
  type: 'break' | 'event'
  title: string
  from: string
  to: string
}

export interface CalendarPlan {
  choices: CalendarChoice[]
  /** יובאו בעבר מלוח שנתי, ובקובץ הזה כבר לא מופיעים */
  gone: GoneItem[]
}

export const goneKey = (g: GoneItem) => `${g.type}:${g.id}`

const norm = (s: string) => s.replace(/[^א-ת0-9a-z]/gi, '')

/** מילה מהקובץ בלי תחילית (ב, ל, ה) ובלי גרש של קיצור */
const bare = (w: string) => {
  const core = w.replace(/['׳"״.,:;()-]/g, '')
  return core.length > 3 ? core.replace(/^[בלה]/, '') : core
}

/** לאיזה מהמקצועות שלי המבחן שייך: "במתמ'" = מתמטיקה, "בפיסיקה" = פיזיקה */
export function matchSubject(title: string, subjects: string[]): { subject: string; guess?: boolean } | undefined {
  const raw = title.split(/[\s/]+/).filter(Boolean)
  const words = raw.map(bare)
  // התאמה מלאה: מילה או צירוף של כמה מילים
  for (const subject of subjects) {
    for (let i = 0; i < words.length; i++) {
      for (let n = 1; n <= 3 && i + n <= words.length; n++) {
        if (sameSubject(words.slice(i, i + n).join(' '), subject)) return { subject }
      }
    }
  }
  // קיצור עם גרש: "מתמ'"
  for (const subject of subjects) {
    const first = subject.split(' ')[0]
    if (raw.some((w, i) => /['׳]$/.test(w) && words[i].length >= 3 && first.startsWith(words[i]) && first !== words[i])) {
      return { subject }
    }
  }
  // אותה מילה ראשונה, כשרק מקצוע אחד שלי מתחיל בה: "כתיבה אקדמית" מול "כתיבה מדעית"
  const loose = subjects.filter((s) => s.includes(' ') && words.includes(s.split(' ')[0]))
  return loose.length === 1 ? { subject: loose[0], guess: true } : undefined
}

/** המרצה שלי במקצוע, מהשיעורים שאני משובץ אליהם או שבחרתי */
function myTeacher(data: ScheduleData, subject: string): string | undefined {
  const mine = new Set([...data.entries.map((e) => e.lessonId), ...data.choiceGroups.map((g) => g.chosenLessonId)])
  return data.lessons.find((l) => mine.has(l.id) && l.teacher && sameSubject(l.name, subject))?.teacher
}

/** משווה את הלוח השנתי למה שכבר בלוח, ומציע מה לסמן */
export function planCalendarImport(data: ScheduleData, cal: YearCalendar): CalendarPlan {
  const subjects = attendedSubjects(data)
  const breaks = data.breaks ?? []
  const usedBreaks = new Set<string>()
  const usedEvents = new Set<string>()

  const choices = cal.items.map((item): CalendarChoice => {
    // ---- מה כבר קיים ----
    let existing: { id?: string; from?: string; to?: string } | undefined
    if (item.kind === 'semester' && item.semester) {
      const now = data.semesters?.[item.semester.key]?.[item.semester.edge]
      if (now) existing = { from: now, to: now }
    } else if (item.kind === 'break') {
      const b =
        breaks.find((x) => x.calendarKey === item.key) ??
        breaks.find(
          (x) => !x.calendarKey && !usedBreaks.has(x.id) && ((x.from === item.from && x.to === item.to) || norm(x.title) === norm(item.title)),
        )
      if (b) {
        usedBreaks.add(b.id)
        existing = b
      }
    } else {
      const e =
        data.events.find((x) => x.calendarKey === item.key) ??
        data.events.find((x) => !x.calendarKey && !usedEvents.has(x.id) && x.date === item.from && norm(x.title) === norm(item.title))
      if (e) {
        usedEvents.add(e.id)
        existing = { id: e.id, from: e.date, to: e.date }
      }
    }

    const match = item.kind === 'exam' ? matchSubject(item.title, subjects) : undefined
    const base = { item, existingId: existing?.id, subject: match?.subject, subjectGuess: match?.guess }
    if (!item.from) return { ...base, status: 'undated', checked: false }
    if (existing?.from === item.from && (existing.to ?? existing.from) === (item.to ?? item.from)) {
      return { ...base, status: 'same', checked: false }
    }
    const status: ChoiceStatus = existing?.from ? 'changed' : 'new'
    const was = existing?.from ? { from: existing.from, to: existing.to ?? existing.from } : undefined

    // ---- מה לסמן מראש ----
    let reason: string | undefined
    if (item.foreign) reason = 'נראה ששייך לתוכנית אחרת או לשנה הבאה'
    else if (item.kind === 'exam') {
      const group = /לקבוצה של\s+(.+)$/.exec(item.title)?.[1]
      const teacher = match ? myTeacher(data, match.subject) : undefined
      if (!match) reason = subjects.length ? 'לא במקצועות שבלוח שלך' : 'אין עדיין מקצועות בלוח'
      else if (group && teacher && !teacher.split(/\s+/).some((part) => part.length > 2 && group.includes(part))) {
        reason = `לקבוצות אחרות (אצלך: ${teacher})`
      }
    }
    // מה שכבר בלוח ורק זז מתעדכן גם אם לא היה מסומן מראש בפעם הראשונה
    return { ...base, status, was, checked: status === 'changed' || !reason, reason }
  })

  const keys = new Set(cal.items.map((i) => i.key))
  const gone: GoneItem[] = [
    ...breaks.filter((b) => b.calendarKey && !keys.has(b.calendarKey)).map((b) => ({ id: b.id, type: 'break' as const, title: b.title, from: b.from, to: b.to })),
    ...data.events
      .filter((e) => e.calendarKey && !keys.has(e.calendarKey))
      .map((e) => ({ id: e.id, type: 'event' as const, title: e.title, from: e.date, to: e.date })),
  ]
  return { choices, gone }
}

/** מוסיף ללוח את מה שסומן, מעדכן תאריכים של מה שכבר יובא, ומסיר את מה שהתבקש */
export function applyCalendarImport(data: ScheduleData, choices: CalendarChoice[], remove: GoneItem[] = []): ScheduleData {
  let next = data
  let breaks: Break[] = [...(data.breaks ?? [])]
  let events: OneOffEvent[] = [...data.events]

  for (const c of choices) {
    const { item } = c
    if (!c.checked || !item.from) continue
    const to = item.to ?? item.from

    if (item.kind === 'semester' && item.semester) {
      const { key, edge } = item.semester
      next = setSemesterDates(next, key, { ...next.semesters?.[key], [edge]: item.from })
    } else if (item.kind === 'break') {
      const old = breaks.find((b) => b.id === c.existingId)
      if (old) breaks = breaks.map((b) => (b === old ? { ...b, from: item.from!, to, calendarKey: item.key } : b))
      else breaks.push({ id: newId('br', breaks.map((b) => b.id)), title: item.title, from: item.from, to, calendarKey: item.key })
    } else {
      const old = events.find((e) => e.id === c.existingId)
      const examSubject = item.kind === 'exam' ? c.subject : undefined
      if (old) {
        // שעה שכבר נקבעה ידנית נשמרת: רק התאריך זז
        events = events.map((e) => (e === old ? { ...e, date: item.from!, calendarKey: item.key, examSubject: e.examSubject ?? examSubject } : e))
      } else {
        events.push({
          id: newId('ev', events.map((e) => e.id)),
          title: item.title,
          date: item.from,
          // בקובץ אין שעות: יום שלם, עם שעה מוצעת למקרה שיקבעו אחת
          allDay: true,
          start: 9 * 60,
          end: 12 * 60,
          examSubject,
          calendarKey: item.key,
        })
      }
    }
  }

  const gone = new Set(remove.map(goneKey))
  breaks = breaks.filter((b) => !gone.has(`break:${b.id}`))
  events = events.filter((e) => !gone.has(`event:${e.id}`))
  return { ...next, breaks: breaks.sort((a, b) => a.from.localeCompare(b.from)), events }
}
