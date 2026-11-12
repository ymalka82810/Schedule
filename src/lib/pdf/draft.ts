import type { DayIndex, Minutes } from '../../types'

/** אפשרות אחת בתוך שיבוץ: מקצוע, ואם יש, מרצה וקבוצה */
export interface DraftOption {
  name: string
  teacher?: string
  /** "קבוצה 1", "קבוצה 3" */
  group?: string
  room?: string
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
}
