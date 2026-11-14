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
