import type { DayIndex, Minutes } from '../../types'
import type { Teacher } from './parseCell'

/** אפשרות אחת בתוך שיבוץ: מקצוע, ואם יש, מרצה וקבוצה */
export interface DraftOption {
  name: string
  teacher?: string
  /** "קבוצה 1", "קבוצה 3" */
  group?: string
  room?: string
  /** הערה על הקורס, למשל "קורס סמסטר א' בלבד" */
  note?: string
}

/**
 * שיבוץ בטיוטה. אם יש יותר מאפשרות אחת, אלה שיעורים במקביל
 * ובסוף הייבוא זו תהיה משבצת בחירה.
 */
export interface DraftItem {
  id: string
  day: DayIndex
  start: Minutes
  end: Minutes
  options: DraftOption[]
  /** הטקסט כפי שנקרא מה-PDF, להשוואה בזמן הבדיקה */
  raw: string
  /** הפענוח לא בטוח, כדאי לבדוק */
  check?: boolean
}

export interface DraftSchedule {
  items: DraftItem[]
  warnings: string[]
  /** שמות הקבצים/כותרות שזוהו, לתצוגה */
  title?: string
  /** התאריך שכתוב בקובץ, למשל "18.10.2026" ב"מעודכנת נכון לתאריך" */
  versionDate?: string
  /** טבלת המרצים מהקובץ, אם נמצאה: להשלמת מרצה וחדר */
  teachers?: Teacher[]
}
