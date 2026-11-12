/** 0 = יום ראשון ... 6 = שבת */
export type DayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6

/** דקות מחצות. 13:30 = 810 */
export type Minutes = number

export type ColorKey =
  | 'cobalt'
  | 'teal'
  | 'moss'
  | 'amber'
  | 'coral'
  | 'plum'
  | 'slate'
  | 'rose'

/** משבצת זמן קבועה בשבוע */
export interface Slot {
  day: DayIndex
  start: Minutes
  end: Minutes
}

/** מקצוע/שיעור. מוגדר פעם אחת ומשובץ בכמה משבצות */
export interface Lesson {
  id: string
  name: string
  teacher?: string
  room?: string
  /** "קבוצה 1" וכד', כשיש כמה קבוצות לאותו מקצוע */
  group?: string
  /** שיעור אישי שלא מגיע מקובץ המערכת (למשל מיגו). ייבוא מקובץ לא מוחק אותו */
  personal?: boolean
  color: ColorKey
}

/** שיבוץ קבוע של שיעור במשבצת */
export interface FixedEntry {
  id: string
  slot: Slot
  lessonId: string
  /** הרצאה / תרגול / מעבדה וכד' */
  kind?: string
  /** חדר שונה מהחדר הרגיל של השיעור */
  room?: string
}

/** משבצת בחירה: כמה שיעורים במקביל, המשתמש לומד רק אחד */
export interface ChoiceGroup {
  id: string
  slot: Slot
  optionLessonIds: string[]
  chosenLessonId: string | null
}

/**
 * חלון תרגול חופשי: זמן קבוע במערכת שהתוכן שלו פתוח.
 * בשלב 4 השיבוץ האוטומטי ימליץ מה לתרגל בו לפי היעדים וההעדפות.
 */
export interface PracticeWindow {
  id: string
  slot: Slot
  name: string
  /** המסגרת שהחלון שייך אליה, למשל שם התכנית */
  context?: string
}

/** יעד גמיש לזמן הפנוי (שלב 4) */
export interface Goal {
  id: string
  name: string
  color: ColorKey
  minHoursPerWeek: number
  maxHoursPerWeek: number
  preferredWindows: Slot[]
}

/** אירוע חד-פעמי, שייך לתאריך מסוים ולא למערכת הקבועה (שלב 3) */
export interface OneOffEvent {
  id: string
  /** YYYY-MM-DD */
  date: string
  start: Minutes
  end: Minutes
  title: string
}

export interface Settings {
  /** טווח השעות המינימלי שמוצג בלוח */
  dayStart: Minutes
  dayEnd: Minutes
}

/**
 * כל מה שנשמר. ההפרדה המרכזית:
 * lessons / entries / choiceGroups / practiceWindows / goals = "מה קבוע"
 * events = "מה השבוע הזה"
 */
export interface ScheduleData {
  version: 1
  lessons: Lesson[]
  entries: FixedEntry[]
  choiceGroups: ChoiceGroup[]
  practiceWindows: PracticeWindow[]
  goals: Goal[]
  events: OneOffEvent[]
  settings: Settings
  /** מאיזה קובץ נבנתה המערכת. חסר אם לא יובאה מקובץ */
  source?: {
    fileName: string
    /** התאריך שכתוב בקובץ ("מעודכנת נכון לתאריך..."), אם נמצא */
    versionDate?: string
    /** ISO */
    importedAt: string
  }
}
