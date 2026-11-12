import type { DayIndex } from '../../../types'
import type { DraftItem, DraftOption } from '../draft'
import type { Teacher } from '../parseCell'

/** טבלת המרצים, בדומה לעמוד השני של המערכת של המכינה */
export const TEACHERS: Teacher[] = [
  { fullName: 'רונן שחק', subject: 'מתמטיקה', room: 'סמסון 177' },
  { fullName: 'יוסי קמיל', subject: 'מתמטיקה', room: 'סמסון 178' },
  { fullName: 'אבי דיין', subject: 'מתמטיקה', room: 'סמסון 179' },
  { fullName: 'שרגא פרייס', subject: 'אנגלית', room: 'ויילר 243' },
  { fullName: 'רמי רחמים', subject: 'אנגלית', room: 'ויילר 244' },
  { fullName: 'דוד קסל', subject: 'פיזיקה', room: 'ויילר 243' },
  { fullName: 'דניאל מנחם', subject: 'כתיבה מדעית', room: 'ויילר 101' },
]

let n = 0
const hm = (s: string) => {
  const [h, m] = s.split(':').map(Number)
  return h * 60 + m
}
export const item = (day: DayIndex, start: string, end: string, ...options: DraftOption[]): DraftItem => ({
  id: `t${++n}`,
  day,
  start: hm(start),
  end: hm(end),
  options,
  raw: '',
})

const math = (teacher: string): DraftOption => ({ name: 'מתמטיקה', teacher })
const english = (teacher: string): DraftOption => ({ name: 'אנגלית', teacher })
const writing = (group: number): DraftOption => ({ name: 'כתיבה מדעית', teacher: 'דניאל מנחם', group: `קבוצה ${group}` })

/** טיוטה מוקטנת בצורת המערכת של המכינה, עם כל הקבוצות */
export function mechinaDraft(): DraftItem[] {
  n = 0
  return [
    // ראשון: שלוש קבוצות מתמטיקה במקביל, ואז אנגלית בשתי קבוצות, וכתיבה מדעית 1+2 מול האנגלית של פרייס
    item(0, '13:30', '15:00', math('רונן שחק'), math('יוסי קמיל'), math('אבי דיין')),
    item(0, '15:15', '16:45', math('רונן שחק'), math('יוסי קמיל'), math('אבי דיין')),
    item(0, '17:45', '18:30', english('שרגא פרייס'), english('רמי רחמים')),
    item(0, '17:45', '18:30', writing(1)),
    item(0, '18:45', '20:15', writing(2)),
    item(0, '18:45', '20:15', english('שרגא פרייס')),
    // שני: שתי מגמות במקביל
    item(1, '13:30', '15:00', { name: 'פיזיקה', teacher: 'דוד קסל' }, { name: 'מבוא למחשבים' }),
    // רביעי: קבוצה 3 בשעה פנויה
    item(3, '18:45', '20:15', writing(3)),
  ]
}
