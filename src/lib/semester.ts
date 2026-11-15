import type { DateRange, Lesson, ScheduleData, SemesterKey } from '../types'

/**
 * סמסטרים: במקום תוקף לכל שיעור לחוד, מגדירים את תאריכי הסמסטר פעם אחת,
 * וכל שיעור של אותו סמסטר (לפי ההערה בקובץ או לפי מה שבחרתי) מקבל אותם לבד.
 */

export const SEMESTERS: SemesterKey[] = ['a', 'b', 'summer']

export const SEMESTER_NAMES: Record<SemesterKey, string> = {
  a: "סמסטר א'",
  b: "סמסטר ב'",
  summer: 'סמסטר קיץ',
}

/** הסמסטר שכתוב בהערה מהקובץ: "קורס סמסטר א' בלבד" → a */
export function semesterFromNote(note: string | undefined): SemesterKey | undefined {
  if (!note) return undefined
  if (/סמסטר\s*קיץ|קורס\s*קיץ/.test(note)) return 'summer'
  const m = note.match(/סמסטר\s*([אב])(?![א-ת])/)
  if (!m) return undefined
  return m[1] === 'א' ? 'a' : 'b'
}

/** הסמסטר של השיעור: מה שבחרתי, או מה שכתוב בהערה. undefined = כל השנה */
export function semesterOf(l: Lesson): SemesterKey | undefined {
  if (l.semester === 'all') return undefined
  return l.semester ?? semesterFromNote(l.note)
}

/** הטווח שבו השיעור קיים: תאריכים שהגדרתי לשיעור, או תאריכי הסמסטר שלו */
export function validRange(l: Lesson, semesters: ScheduleData['semesters']): DateRange {
  if (l.validFrom || l.validUntil) return { from: l.validFrom, to: l.validUntil }
  const key = semesterOf(l)
  return (key && semesters?.[key]) || {}
}

/** שיעורים ששייכים לסמסטר (בלי אלה שיש להם תאריכים משלהם) */
export const lessonsOfSemester = (data: ScheduleData, key: SemesterKey) =>
  data.lessons.filter((l) => !l.validFrom && !l.validUntil && semesterOf(l) === key)

/** שמירת תאריכי סמסטר. טווח ריק מוחק אותו */
export function setSemesterDates(data: ScheduleData, key: SemesterKey, range: DateRange): ScheduleData {
  const semesters = { ...data.semesters }
  if (range.from || range.to) semesters[key] = { from: range.from || undefined, to: range.to || undefined }
  else delete semesters[key]
  return { ...data, semesters }
}

const isoPlus = (iso: string, n: number) => {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8) + n))
  return d.toISOString().slice(0, 10)
}

/**
 * תגית לשיעור שבועי בתאריך מסוים: "שיעור אחרון" כשבעוד שבוע הוא כבר לא בתוקף,
 * ו"שיעור ראשון" כשלפני שבוע הוא עוד לא היה. בלי תאריכי תוקף: אין תגית
 */
export function termTag(l: Lesson, date: string, semesters: ScheduleData['semesters']): string | undefined {
  const { from, to } = validRange(l, semesters)
  if (to && date <= to && isoPlus(date, 7) > to) return 'שיעור אחרון'
  if (from && date >= from && isoPlus(date, -7) < from) return 'שיעור ראשון'
  return undefined
}

export interface TermNotice {
  kind: 'ends' | 'starts'
  /** שמות השיעורים */
  names: string[]
  /** הסמסטר, כשכל השיעורים שייכים לאותו סמסטר */
  semester?: SemesterKey
  /** YYYY-MM-DD: תאריך הסיום או ההתחלה */
  date: string
}

/**
 * מה נגמר או מתחיל בשבוע המוצג, לשיעורים שאני לומד: "השבוע האחרון של כתיבה מדעית".
 * שבוע אחרון = יום הסיום בשבוע הזה או בשבוע הבא לפני שמגיע שוב אותו יום בשבוע,
 * כלומר הטווח נגמר לפני שבוע מהיום האחרון בשבוע המוצג
 */
export function termNotices(data: ScheduleData, weekDates: string[]): TermNotice[] {
  const mine = new Set<string>([
    ...data.entries.map((e) => e.lessonId),
    ...data.choiceGroups.map((g) => g.chosenLessonId).filter((x): x is string => !!x),
  ])
  const first = weekDates[0]
  const last = weekDates[weekDates.length - 1]
  const groups = new Map<string, TermNotice>()
  for (const l of data.lessons) {
    if (!mine.has(l.id)) continue
    const { from, to } = validRange(l, data.semesters)
    const add = (kind: TermNotice['kind'], date: string) => {
      const key = `${kind}:${date}`
      const cur = groups.get(key)
      const sem = semesterOf(l)
      if (!cur) groups.set(key, { kind, names: [l.name], semester: sem, date })
      else {
        if (!cur.names.includes(l.name)) cur.names.push(l.name)
        if (cur.semester !== sem) cur.semester = undefined
      }
    }
    if (to && to >= first && to < isoPlus(last, 1)) add('ends', to)
    if (from && from >= first && from <= last) add('starts', from)
  }
  return [...groups.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/** בעיות בתאריכי הסמסטרים: סיום לפני התחלה, או סמסטרים חופפים */
export function semesterProblems(semesters: ScheduleData['semesters']): string[] {
  const out: string[] = []
  const list = SEMESTERS.map((k) => ({ k, r: semesters?.[k] })).filter((x) => x.r?.from || x.r?.to)
  for (const { k, r } of list) if (r?.from && r.to && r.to < r.from) out.push(`ב${SEMESTER_NAMES[k]} תאריך הסיום לפני ההתחלה.`)
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i].r!
      const b = list[j].r!
      if (a.from && a.to && b.from && b.to && a.from <= b.to && b.from <= a.to)
        out.push(`${SEMESTER_NAMES[list[i].k]} ו${SEMESTER_NAMES[list[j].k]} חופפים בתאריכים.`)
    }
  return out
}
