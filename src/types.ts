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
  /** תוקף: השיעור קיים רק בין התאריכים (YYYY-MM-DD, כולל). חסר = תמיד */
  validFrom?: string
  validUntil?: string
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
  /** סוג כל אפשרות (הרצאה / תרגול / מעבדה), לפי מזהה השיעור. רק לאפשרויות שיש להן סוג */
  kinds?: Record<string, string>
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

/**
 * סוג הלמידה של יעד. לכל סוג כללי תכנון משלו, לפי המחקר על למידה:
 * knowledge = ידע (עובדות, מושגים, אוצר מילים): מפגשים קצרים ותכופים וחזרות מרווחות
 * skill = מיומנות (נגינה, ספורט, פתרון תרגילים): בלוקים מרוכזים, עד כשעה וחצי ביום
 * creative = יצירה (כתיבה, פרויקט): בלוקים ארוכים ורצופים של עבודה עמוקה
 */
export type GoalKind = 'knowledge' | 'skill' | 'creative'

/** איך הרגיש המפגש: מקצר או מאריך את המרווח לחזרה הבאה */
export type Rating = 'easy' | 'ok' | 'hard'

/** יעד גמיש לזמן הפנוי (שלב 4): המערכת משבצת אותו לבד בזמן הפנוי של כל שבוע */
export interface Goal {
  id: string
  name: string
  /** סוג הלמידה. חסר = בלי כללים מיוחדים (כמו לפני שהשדה נוסף) */
  kind?: GoalKind
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
  /**
   * יעד עם תאריך יעד: סך השעות עד התאריך (כולל), במקום שעות קבועות בשבוע.
   * בכל שבוע המערכת מחשבת כמה נשאר ומחלקת שווה על הימים שנותרו
   */
  totalHours?: number
  /** YYYY-MM-DD */
  deadline?: string
  /** YYYY-MM-DD: מתי היעד נוצר. מפגשים שהיו מתוכננים לפני כן לא נחשבים פספוס */
  since?: string
  /** כמה מפגשים לכל היותר ביום. ברירת מחדל 1 */
  maxPerDay?: number
  /** רק בימים האלה. חסר או ריק = כל יום שמותר לתכנן בו */
  days?: DayIndex[]
  /** רק בין השעות האלה (למשל אימון רק בבוקר) */
  earliest?: Minutes
  latest?: Minutes
}

/** ביטול של שיבוץ קבוע בשבוע אחד (מרצה חולה, חופשה) */
export interface Cancellation {
  id: string
  /** YYYY-MM-DD */
  date: string
  /** מזהה השיבוץ, משבצת הבחירה או חלון התרגול */
  refId: string
}

/** הזזה של שיבוץ קבוע (שיעור, משבצת בחירה או חלון תרגול) בשבוע אחד בלבד. המקום הקבוע לא משתנה */
export interface Move {
  id: string
  /** מזהה השיבוץ, משבצת הבחירה או חלון התרגול */
  refId: string
  /** YYYY-MM-DD: התאריך שבו השיבוץ היה אמור להיות לפי המערכת הקבועה */
  date: string
  /** YYYY-MM-DD: לאן הוזז (באותו שבוע) */
  toDate: string
  start: Minutes
  end: Minutes
}

/** מפגש מתוכנן שהזזתי בגרירה: נשאר במקום החדש בשבוע הזה, והתכנון משלים סביבו */
export interface SessionPin {
  id: string
  goalId: string
  /** YYYY-MM-DD */
  date: string
  start: Minutes
  end: Minutes
  /** מפגש חזרה מרווחת שהוזז */
  reviewId?: string
  /** איפה התכנון האוטומטי שם אותו לפני ההזזה */
  fromDate: string
  fromStart: Minutes
  /** סוף המפגש המקורי, אם האורך שונה */
  fromEnd?: Minutes
  /** הרישום ב-planFeedback שנוצר מההזזה */
  feedbackId: string
}

/** "לא מתאים לי כאן": המפגש לא ישובץ בסביבת השעה הזו בתאריך הזה, והתכנון מוצא לו מקום אחר */
export interface SessionSkip {
  id: string
  goalId: string
  /** YYYY-MM-DD */
  date: string
  start: Minutes
  end: Minutes
  reviewId?: string
}

/**
 * מה עשיתי עם מפגש מתוכנן: הזזתי (לאן) או אמרתי שלא מתאים. ממה שחוזר על עצמו המערכת לומדת העדפות
 * (שעות ביום וימים בשבוע), ראו lib/prefs.ts
 */
export interface PlanFeedback {
  id: string
  goalId: string
  /** YYYY-MM-DD: התאריך שבו התכנון שם את המפגש */
  date: string
  day: DayIndex
  start: Minutes
  action: 'moved' | 'removed'
  toDay?: DayIndex
  toStart?: Minutes
}

/** סימון שתרגלתי: מפגש של יעד שבוצע בפועל. נשאר במקומו ולא זז בתכנון */
export interface PracticeLog {
  id: string
  goalId: string
  /** YYYY-MM-DD */
  date: string
  start: Minutes
  end: Minutes
  /** תיעוד של דקה אחרי המפגש */
  rating?: Rating
  /** מה למדתי או תרגלתי. ביעד ידע זה יוצר חזרות מרווחות */
  topic?: string
  /** איפה נתקעתי */
  stuck?: string
  /** המפגש היה חזרה על נושא (מזהה החזרה) */
  reviewId?: string
  /** כמה דקות היה מתוכנן, כשתרגלתי זמן אחר (end - start הוא מה שתרגלתי בפועל) */
  planned?: Minutes
  /** החזרה כפי שהייתה לפני הסימון, כדי שביטול הסימון יחזיר אותה */
  reviewBefore?: Review
}

/**
 * חזרה מרווחת על נושא: נוצרת כשמסיימים מפגש עם נושא חדש ביעד ידע.
 * תמיד נשמרת רק החזרה הבאה בשרשרת. חזרה שדילגו עליה נדחית ולא נעלמת.
 */
export interface Review {
  id: string
  goalId: string
  topic: string
  /** YYYY-MM-DD: מתי לחזור */
  due: string
  /** מספר החזרה בשרשרת, מ-0 */
  step: number
  /** המפגש שיצר את השרשרת. ביטול הסימון שלו מוחק אותה */
  fromLogId?: string
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
  /** השעות שבהן אני חד: למידה קשה מושמת שם, ותרגול קל בשעות העייפות. חסר = אין העדפה */
  sharpFrom?: Minutes
  sharpTo?: Minutes
  /** זמן הגעה למוסד: לפני השיעור הראשון ביום ואחרי האחרון. חסר = 0 */
  travelMinutes?: Minutes
  /** כמה שעות ביום לכל היותר, שיעורים ותרגול יחד. חסר = 10 */
  maxLoadPerDay?: number
  /** עיר לחישוב זמני היום (לתפילות). שם באנגלית כמו ב-hebcal, חסר = Jerusalem */
  location?: string
  /** זמנים קבועים שהתכנון שומר פנויים: ארוחות, תפילות */
  routines?: Routine[]
}

/** זמני היום שאפשר לעגן אליהם שגרה */
export type Zman = 'alot' | 'sunrise' | 'chatzot' | 'minchaGedola' | 'minchaKetana' | 'plag' | 'sunset' | 'tzeit'

/** שעה קבועה, או זמן מזמני היום עם הזזה בדקות (שלילי = לפני) */
export type TimeRef = { at: Minutes } | { zman: Zman; offset: Minutes }

/**
 * שגרה: משהו שצריך X דקות בתוך חלון זמן, בימים מסוימים (ארוחת צהריים בין 12:00 ל-14:30, מנחה לפני השקיעה).
 * התכנון שומר לה מקום בחלון, ליד השיעורים אם אפשר, ולא משבץ שם תרגול.
 */
export interface Routine {
  id: string
  name: string
  days: DayIndex[]
  from: TimeRef
  to: TimeRef
  minutes: Minutes
}

/** אירוע חד-פעמי, שייך לתאריך מסוים ולא למערכת הקבועה (שלב 3) */
export interface OneOffEvent {
  id: string
  /** YYYY-MM-DD */
  date: string
  start: Minutes
  end: Minutes
  title: string
  /** מבחן במקצוע הזה: התכנון מגביר את התרגול לפניו */
  examSubject?: string
}

/** חופשה של המוסד: אין לימודים בין התאריכים (כולל) */
export interface Break {
  id: string
  title: string
  /** YYYY-MM-DD */
  from: string
  to: string
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
  /** הזזות של שיבוצים קבועים בשבוע אחד */
  moves?: Move[]
  /** מפגשים מתוכננים שהוזזו בגרירה */
  planPins?: SessionPin[]
  /** מפגשים מתוכננים שסומנו "לא מתאים לי כאן" */
  planSkips?: SessionSkip[]
  /** היסטוריית ההזזות והדחיות, שממנה נלמדות העדפות */
  planFeedback?: PlanFeedback[]
  /** חופשות: אין שיעורים, אבל מתכננים כרגיל */
  breaks?: Break[]
  /** מפגשי תרגול שסומנו כבוצעו */
  log?: PracticeLog[]
  /** חזרות מרווחות שממתינות */
  reviews?: Review[]
  settings: Settings
  /** הגדרות תכנון הזמן הפנוי. חסר = ברירת המחדל */
  plan?: PlanSettings
  /**
   * הבחירות שלי באשף "מי אני" (אילו מקצועות, ואיזו קבוצה או מרצה בכל אחד).
   * נשמרות בנפרד מהמערכת, כדי שייבוא של גרסה חדשה, גם בסביבה אחרת, ידע מה שלי בלי לשאול שוב
   */
  wizard?: {
    subjects: Record<string, boolean>
    variants: Record<string, string | null>
  }
  /** מאיזה קובץ נבנתה המערכת. חסר אם לא יובאה מקובץ */
  source?: {
    fileName: string
    /** התאריך שכתוב בקובץ ("מעודכנת נכון לתאריך..."), אם נמצא */
    versionDate?: string
    /** ISO */
    importedAt: string
    /** YYYY-MM-DD: לא להזכיר לבדוק גרסה חדשה לפני התאריך הזה */
    remindAfter?: string
  }
}
