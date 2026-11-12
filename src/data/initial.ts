import type { DayIndex, FixedEntry, ScheduleData } from '../types'
import { hm } from '../lib/time'

/**
 * המערכת של יוחאי: המכינה להנדסה ומחשבים, המרכז האקדמי לב.
 * מקור: "מערכת הנדסה – מעודכנת נכון לתאריך 18.10.2026".
 * קבוצות: מתמטיקה 5 יח׳ (שחק), אנגלית טרום בסיסי א׳ (פרייס), פיזיקה (קסל).
 *
 * בקרים: תכנית מיגו בימי שני, רביעי וחמישי (לימוד תורה ואז תרגול חופשי).
 *
 * שיעורים רצופים אוחדו לבלוק אחד; ההפסקות (15:00, 16:45, 18:30) מפרידות בין בלוקים.
 */

let n = 0
const entry = (
  day: DayIndex,
  lessonId: string,
  start: [number, number],
  end: [number, number],
): FixedEntry => ({
  id: `e${++n}`,
  slot: { day, start: hm(...start), end: hm(...end) },
  lessonId,
})

const MIGO_DAYS: DayIndex[] = [1, 3, 4]

export const initialData: ScheduleData = {
  version: 1,
  lessons: [
    { id: 'math', name: 'מתמטיקה', teacher: 'רונן שחק', room: 'סמסון 177', color: 'cobalt' },
    { id: 'physics', name: 'פיזיקה', teacher: 'דוד קסל', room: 'ויילר 243', color: 'coral' },
    { id: 'english', name: 'אנגלית', teacher: 'שרגא פרייס', room: 'ויילר 243', color: 'amber' },
    { id: 'migo', name: 'לימוד תורה', room: 'תכנית מיגו', color: 'plum' },
    // הנחה: קבוצה 3, כי קבוצות 1 ו-2 מתנגשות עם האנגלית של פרייס ביום ראשון
    { id: 'writing', name: 'כתיבה מדעית', teacher: 'דניאל מנחם', color: 'moss' },
  ],
  entries: [
    // מיגו: שני, רביעי, חמישי
    ...MIGO_DAYS.map((day) => entry(day, 'migo', [10, 0], [11, 15])),

    // ראשון
    entry(0, 'math', [13, 30], [15, 0]),
    entry(0, 'math', [15, 15], [16, 45]),
    entry(0, 'math', [17, 0], [17, 45]),
    entry(0, 'english', [17, 45], [18, 30]),
    entry(0, 'english', [18, 45], [20, 15]),

    // שני
    entry(1, 'physics', [13, 30], [15, 0]),
    entry(1, 'physics', [15, 15], [16, 45]),
    entry(1, 'physics', [17, 0], [17, 45]),
    entry(1, 'math', [17, 45], [18, 30]),
    entry(1, 'math', [18, 45], [20, 15]),

    // שלישי
    entry(2, 'english', [13, 30], [15, 0]),
    entry(2, 'english', [15, 15], [16, 0]),
    entry(2, 'physics', [16, 0], [16, 45]),
    entry(2, 'physics', [17, 0], [18, 30]),
    entry(2, 'physics', [18, 45], [20, 15]),

    // רביעי
    entry(3, 'physics', [13, 30], [15, 0]),
    entry(3, 'physics', [15, 15], [16, 0]),
    entry(3, 'english', [16, 0], [16, 45]),
    entry(3, 'english', [17, 0], [18, 30]),
    entry(3, 'writing', [18, 45], [20, 15]),

    // חמישי
    entry(4, 'math', [13, 30], [15, 0]),
    entry(4, 'math', [15, 15], [16, 45]),
    entry(4, 'math', [17, 0], [17, 45]),
  ],
  choiceGroups: [],
  practiceWindows: MIGO_DAYS.map((day) => ({
    id: `p${day}`,
    slot: { day, start: hm(11, 15), end: hm(13) },
    name: 'תרגול חופשי',
    context: 'תכנית מיגו',
  })),
  goals: [],
  events: [],
  settings: { dayStart: hm(9), dayEnd: hm(21) },
}
