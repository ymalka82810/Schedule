import type { Lesson } from '../types'

/**
 * פעילות קבועה מול שיעור. שיעור הוא מקצוע שלומדים בו, ולכן המערכת משבצת לו תרגול בזמן הפנוי.
 * פעילות קבועה (אימון, עבודה, חוג) רק תופסת זמן בלוח, ואין לה תרגול.
 * בלי בחירה מפורשת מנחשים לפי השם והחדר.
 */
const ACTIVITY_WORDS = [
  'אימון',
  'אימונים',
  'כושר',
  'ספורט',
  'ריצה',
  'שחייה',
  'הליכה',
  'יוגה',
  'עבודה',
  'משמרת',
  'חוג',
  'התנדבות',
  'מיגו',
  'תפילה',
  'גמ"ח',
]

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** האם השם נשמע כמו פעילות קבועה ולא כמו מקצוע */
export function guessActivity(name: string, room?: string): boolean {
  const text = ` ${`${name} ${room ?? ''}`.replace(/[^א-ת"a-zA-Z\s]/g, ' ')} `
  return ACTIVITY_WORDS.some((w) => new RegExp(`\\s[והלבמש]{0,2}${escapeRe(w)}(?=\\s)`).test(text))
}

/** פעילות קבועה: לפי מה שבחרתי, ואם לא בחרתי לפי השם */
export const isActivity = (l: Lesson) => l.activity ?? guessActivity(l.name, l.room)

/** מקצוע שהמערכת מתכננת לו תרגול: כל שיעור, גם שהוספתי ידנית, חוץ מפעילות קבועה */
export const isSubject = (l: Lesson) => !isActivity(l)
