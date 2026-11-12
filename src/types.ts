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
  /** הערה על הקורס מהקובץ, למשל "קורס סמסטר א' בלבד" */
  note?: string
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

/** יעד גמיש לזמן הפנוי (שלב 4): המערכת משבצת אותו לבד בזמן הפנוי של כל שבוע */
export interface Goal {
  id: string
  name: string
  color: ColorKey
  minHoursPerWeek: number
  maxHoursPerWeek: number
  preferredWindows: Slot[]
  /** המקצוע שהיעד קשור אליו (שם השיעור). מאפשר לשבץ תרגול אחרי השיעור או לפני השיעור הבא */
  subject?: string
  /** אורך מפגש בדקות. ברירת מחדל 60 */
  sessionMinutes?: number
  /** לשבץ קודם בחלונות התרגול (כמו מיגו) */
  preferPractice?: boolean
  /** כמה מפגשים לכל היותר ביום. ברירת מחדל 1 */
  maxPerDay?: number
}

/** ביטול של שיבוץ קבוע בשבוע אחד (מרצה חולה, חופשה) */
export interface Cancellation {
  id: string
  /** YYYY-MM-DD */
  date: string
  /** מזהה השיבוץ, משבצת הבחירה או חלון התרגול */
  refId: string
}

/** סימון שתרגלתי: מפגש של יעד שבוצע בפועל. נשאר במקומו ולא זז בתכנון */
export interface PracticeLog {
  id: string
  goalId: string
  /** YYYY-MM-DD */
  date: string
  start: Minutes
  end: Minutes
}

/** איך מתכננים את הזמן הפנוי */
export interface PlanSettings {
  /** מתי מתחיל ונגמר היום הפעיל (קימה ושינה) */
  dayStart: Minutes
  dayEnd: Minutes
  /** הפסקה מינימלית לפני ואחרי כל שיעור או מפגש */
  breakMinutes: Minutes
  /** בשישי מסיימים מוקדם. null = יום רגיל */
  fridayEnd: Minutes | null
  /** ימים בלי תכנון בכלל */
  offDays: DayIndex[]
  /** כמה שעות תרגול לכל היותר ביום */
  maxHoursPerDay: number
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
  /** ביטולים של שיבוצים בשבוע מסוים */
  cancellations?: Cancellation[]
  /** מפגשי תרגול שסומנו כבוצעו */
  log?: PracticeLog[]
  settings: Settings
  /** הגדרות תכנון הזמן הפנוי. חסר = ברירת המחדל */
  plan?: PlanSettings
  /** מאיזה קובץ נבנתה המערכת. חסר אם לא יובאה מקובץ */
  source?: {
    fileName: string
    /** התאריך שכתוב בקובץ ("מעודכנת נכון לתאריך..."), אם נמצא */
    versionDate?: string
    /** ISO */
    importedAt: string
  }
}
