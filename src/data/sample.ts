import type { ScheduleData } from '../types'
import { hm } from '../lib/time'

/**
 * מערכת לדוגמה, כדי שיהיה מה לראות עד שתיבנה הזנת השיעורים (שלב 2).
 * השמות, המרצים והחדרים מומצאים.
 */
export const sampleData: ScheduleData = {
  version: 1,
  lessons: [
    { id: 'bm', name: 'בית מדרש', color: 'slate' },
    { id: 'infi', name: 'אינפי 1', teacher: 'ד״ר לוי', room: 'בניין 2, 104', color: 'cobalt' },
    { id: 'physics', name: 'פיזיקה 1', teacher: 'פרופ׳ שגיא', room: 'אודיטוריום', color: 'coral' },
    { id: 'linear', name: 'אלגברה לינארית', teacher: 'ד״ר אזולאי', room: 'בניין 2, 210', color: 'teal' },
    { id: 'cs', name: 'מבוא למדעי המחשב', teacher: 'מר בן דוד', room: 'מעבדת מחשבים 3', color: 'plum' },
    { id: 'english', name: 'אנגלית מתקדמים', teacher: 'גב׳ הראל', room: 'בניין 1, 12', color: 'amber' },
    { id: 'lab', name: 'מעבדה בפיזיקה', teacher: 'מר נחום', room: 'מעבדה ב׳', color: 'rose' },
    { id: 'astro', name: 'מבוא לאסטרונומיה', teacher: 'ד״ר פרץ', room: 'בניין 3, 301', color: 'moss' },
    { id: 'venture', name: 'יסודות היזמות', teacher: 'מר שלום', room: 'בניין 3, 305', color: 'amber' },
  ],
  entries: [
    ...([0, 1, 2, 3, 4] as const).map((day) => ({
      id: `bm-${day}`,
      slot: { day, start: hm(9), end: hm(12, 30) },
      lessonId: 'bm',
    })),

    { id: 'e1', slot: { day: 0, start: hm(13, 30), end: hm(15) }, lessonId: 'infi', kind: 'הרצאה' },
    { id: 'e2', slot: { day: 0, start: hm(15, 15), end: hm(16, 45) }, lessonId: 'physics', kind: 'הרצאה' },
    { id: 'e3', slot: { day: 0, start: hm(17), end: hm(18, 30) }, lessonId: 'english' },

    { id: 'e4', slot: { day: 1, start: hm(13, 30), end: hm(15) }, lessonId: 'linear', kind: 'הרצאה' },
    { id: 'e5', slot: { day: 1, start: hm(15, 15), end: hm(16, 45) }, lessonId: 'cs', kind: 'הרצאה' },

    { id: 'e6', slot: { day: 2, start: hm(13, 30), end: hm(15) }, lessonId: 'physics', kind: 'הרצאה' },
    { id: 'e7', slot: { day: 2, start: hm(15, 15), end: hm(16, 45) }, lessonId: 'infi', kind: 'תרגול', room: 'בניין 2, 108' },

    { id: 'e8', slot: { day: 3, start: hm(13, 30), end: hm(15) }, lessonId: 'cs', kind: 'תרגול' },
    { id: 'e9', slot: { day: 3, start: hm(15, 15), end: hm(16, 45) }, lessonId: 'linear', kind: 'תרגול' },
    { id: 'e10', slot: { day: 3, start: hm(17), end: hm(19) }, lessonId: 'lab' },

    { id: 'e11', slot: { day: 4, start: hm(13, 30), end: hm(15) }, lessonId: 'infi', kind: 'הרצאה' },
    { id: 'e12', slot: { day: 4, start: hm(15, 15), end: hm(16) }, lessonId: 'physics', kind: 'תרגול', room: 'בניין 2, 104' },
    { id: 'e13', slot: { day: 4, start: hm(16, 15), end: hm(17, 45) }, lessonId: 'english' },
  ],
  choiceGroups: [
    {
      id: 'c1',
      slot: { day: 1, start: hm(17), end: hm(18, 30) },
      optionLessonIds: ['astro', 'venture'],
      chosenLessonId: null,
    },
  ],
  goals: [],
  events: [],
  settings: { dayStart: hm(8), dayEnd: hm(20) },
}
