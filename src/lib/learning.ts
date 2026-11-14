import type { Goal, GoalKind, Minutes, PracticeLog, Rating, Review, ScheduleData } from '../types'
import { newId } from './edit'

/**
 * מנוע הלמידה: כללי תכנון לפי סוג הלמידה, וחזרות מרווחות.
 * הכללים כלליים לכל תחום, ונשענים על המחקר: שליפה מהזיכרון ופיזור בזמן (Dunlosky 2013, Cepeda 2006),
 * תרגול מכוון (Ericsson), ערבוב (Bjork) ובלוקי ריכוז בלי הפרעות (Leroy, Newport).
 */

export interface KindRules {
  label: string
  /** משפט אחד שמסביר את הסוג בבחירה */
  describe: string
  /** אורך מפגש מומלץ */
  session: Minutes
  /** כמה מפגשים ביום, לכל היותר */
  maxPerDay: number
  /** כמה דקות ביום באותו תחום, לכל היותר. מעבר לזה כבר לא מועיל */
  dailyCap: Minutes
  /** בלוק עבודה רצוף, לכל היותר. מפגש ארוך יותר מתחלק עם הפסקות קצרות */
  maxBlock: Minutes
  /** איך לעבוד במפגש עצמו */
  tip: string
}

export const KINDS: Record<GoalKind, KindRules> = {
  knowledge: {
    label: 'ידע',
    describe: 'עובדות, מושגים, נוסחאות, אוצר מילים. מפגשים קצרים ותכופים, וחזרות מרווחות על כל נושא.',
    session: 30,
    maxPerDay: 2,
    dailyCap: 90,
    maxBlock: 50,
    tip: 'סגור את המחברת ונסה להיזכר או לפתור לבד, ורק אז בדוק. שליפה מהזיכרון מחזקת אותו הרבה יותר מקריאה חוזרת או הדגשה.',
  },
  skill: {
    label: 'מיומנות',
    describe: 'נגינה, ספורט, פתרון תרגילים, דיבור. בלוקים מרוכזים על חולשה אחת, עד כשעה וחצי ביום.',
    session: 45,
    maxPerDay: 2,
    dailyCap: 90,
    maxBlock: 50,
    tip: 'בחר חולשה אחת ומטרה מדויקת למפגש, למשל "5 תרגילים מסוג אחד". ריכוז מלא בלי טלפון, ובסוף בדוק אם הגעת למטרה.',
  },
  creative: {
    label: 'יצירה',
    describe: 'כתיבה, פרויקט, עיצוב. בלוקים ארוכים ורצופים של עבודה עמוקה.',
    session: 90,
    maxPerDay: 1,
    dailyCap: 180,
    maxBlock: 120,
    tip: 'בלי הפרעות ובלי לבדוק הודעות באמצע. בסוף רשום משפט על איפה עצרת, כדי שיהיה קל להתחיל בפעם הבאה. כדאי לחזור על מה שכתבת אחרי כמה ימים, בראש רענן.',
  },
}

export const REVIEW_TIP =
  'בלי להסתכל בחומר: נסה להיזכר או לפתור, ורק אחר כך בדוק. דרג כמה היה קשה, וזה יקבע מתי החזרה הבאה.'

/** אורך מפגש חזרה */
export const REVIEW_MINUTES: Minutes = 20

/** כמה חזרות לכל היותר ביום, מכל היעדים יחד. השאר עוברות ליום הבא */
export const MAX_REVIEWS_PER_DAY = 3

/** המרווחים בין החזרות, בימים: יום, שלושה ימים, שבוע, שבועיים, חודש */
export const INTERVALS = [1, 3, 7, 14, 30]

export const sessionLength = (g: Goal): Minutes => g.sessionMinutes ?? (g.kind ? KINDS[g.kind].session : 60)
export const maxPerDay = (g: Goal): number => g.maxPerDay ?? (g.kind ? KINDS[g.kind].maxPerDay : 1)

/** תיאור של מפגש ארוך שמתחלק לבלוקים עם הפסקות, או null אם הוא קצר מספיק */
export function blocksOf(kind: GoalKind | undefined, len: Minutes): { count: number; each: Minutes; rest: Minutes } | null {
  if (!kind) return null
  const max = KINDS[kind].maxBlock
  if (len <= max) return null
  const rest = 10
  const count = Math.ceil((len + rest) / (max + rest))
  const each = Math.floor((len - rest * (count - 1)) / count / 5) * 5
  return { count, each, rest }
}

export const addDaysIso = (date: string, days: number): string => {
  const d = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8) + days))
  return d.toISOString().slice(0, 10)
}

/** "בעוד יום", "בעוד שבוע" */
export const intervalText = (days: number) =>
  days === 1 ? 'אחרי יום' : days === 7 ? 'אחרי שבוע' : days === 14 ? 'אחרי שבועיים' : days === 30 ? 'אחרי חודש' : `אחרי ${days} ימים`

/** החזרה הבאה אחרי שחזרתי היום: קל מדלג שלב, קשה חוזר שלב אחורה. null = השרשרת הסתיימה */
export function nextReview(r: Review, rating: Rating, date: string): Review | null {
  const step = rating === 'easy' ? r.step + 2 : rating === 'hard' ? Math.max(0, r.step - 1) : r.step + 1
  if (step >= INTERVALS.length) return null
  return { ...r, step, due: addDaysIso(date, INTERVALS[step]) }
}

export interface LogDetails {
  rating?: Rating
  topic?: string
  stuck?: string
  /** כמה דקות תרגלתי בפועל, אם שונה מהמתוכנן */
  minutes?: Minutes
}

const clean = (s?: string) => s?.trim() || undefined

/**
 * סימון שתרגלתי, עם תיעוד קצר. ביעד ידע, נושא שנרשם יוצר שרשרת חזרות מרווחות.
 * קושי במפגש עצמו משנה את החזרה הראשונה: קשה = כבר מחר, קל = מדלג לשלושה ימים.
 */
export function logSession(
  data: ScheduleData,
  session: { goalId: string; start: Minutes; end: Minutes },
  date: string,
  details: LogDetails = {},
): ScheduleData {
  const log = data.log ?? []
  const id = newId('done', log.map((l) => l.id))
  const entry: PracticeLog = {
    id,
    goalId: session.goalId,
    date,
    start: session.start,
    end: session.end,
    ...(details.minutes && details.minutes > 0 && details.minutes !== session.end - session.start
      ? { end: session.start + details.minutes, planned: session.end - session.start }
      : {}),
    ...(details.rating ? { rating: details.rating } : {}),
    ...(clean(details.topic) ? { topic: clean(details.topic) } : {}),
    ...(clean(details.stuck) ? { stuck: clean(details.stuck) } : {}),
  }
  let reviews = data.reviews ?? []
  const goal = data.goals.find((g) => g.id === session.goalId)
  if (goal?.kind === 'knowledge' && entry.topic) {
    const step = details.rating === 'easy' ? 1 : 0
    reviews = [
      ...reviews,
      {
        id: newId('rev', reviews.map((r) => r.id)),
        goalId: goal.id,
        topic: entry.topic,
        step,
        due: addDaysIso(date, INTERVALS[step]),
        fromLogId: id,
      },
    ]
  }
  return { ...data, log: [...log, entry], reviews }
}

/** סימון שחזרתי על נושא: החזרה מתקדמת בשרשרת לפי הקושי */
export function logReview(
  data: ScheduleData,
  review: Review,
  session: { start: Minutes; end: Minutes },
  date: string,
  details: { rating: Rating; stuck?: string },
): ScheduleData {
  const log = data.log ?? []
  const entry: PracticeLog = {
    id: newId('done', log.map((l) => l.id)),
    goalId: review.goalId,
    date,
    start: session.start,
    end: session.end,
    rating: details.rating,
    topic: review.topic,
    reviewId: review.id,
    reviewBefore: review,
    ...(clean(details.stuck) ? { stuck: clean(details.stuck) } : {}),
  }
  const next = nextReview(review, details.rating, date)
  const reviews = (data.reviews ?? []).flatMap((r) => (r.id !== review.id ? [r] : next ? [next] : []))
  return { ...data, log: [...log, entry], reviews }
}

/** ביטול סימון: מחזיר את החזרה למצב שלפניו, או מוחק את השרשרת שהמפגש יצר */
export function unlogSession(data: ScheduleData, logId: string): ScheduleData {
  const log = data.log ?? []
  const entry = log.find((l) => l.id === logId)
  if (!entry) return data
  let reviews = (data.reviews ?? []).filter((r) => r.fromLogId !== logId)
  if (entry.reviewBefore) {
    const before = entry.reviewBefore
    reviews = [...reviews.filter((r) => r.id !== before.id), before]
  }
  return { ...data, log: log.filter((l) => l.id !== logId), reviews }
}

/** הפסקת שרשרת חזרות על נושא */
export const removeReview = (data: ScheduleData, id: string): ScheduleData => ({
  ...data,
  reviews: (data.reviews ?? []).filter((r) => r.id !== id),
})

/** מה נרשם ב"איפה נתקעתי" במפגש האחרון של היעד לפני התאריך, כנקודת התחלה למפגש הבא */
export function lastStuck(
  data: ScheduleData,
  goalId: string,
  before: string,
  beforeStart = 0,
): { stuck: string; date: string } | null {
  const last = (data.log ?? [])
    .filter((l) => l.goalId === goalId && !l.reviewId && (l.date < before || (l.date === before && l.end <= beforeStart)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)
    .at(-1)
  return last?.stuck ? { stuck: last.stuck, date: last.date } : null
}

/**
 * מילים בשם של יעד שמרמזות על סוג הלמידה. הסדר חשוב: ידע קודם ("תרגול אוצר מילים" = ידע),
 * אחר כך יצירה ("תרגול כתיבה" = יצירה), ובסוף מיומנות. אימון כושר וקריאה להנאה נשארים בלי סוג.
 */
const KIND_HINTS: Array<{ kind: GoalKind; words: string[] }> = [
  {
    kind: 'knowledge',
    words: ['אוצר מילים', 'מילים', 'מילון', 'שינון', 'לשנן', 'מושגים', 'הגדרות', 'נוסחאות', 'תאריכים', 'חזרה', 'vocabulary', 'vocab'],
  },
  {
    kind: 'creative',
    words: ['כתיבה', 'כתיבת', 'לכתוב', 'סיפור', 'סיפורים', 'רומן', 'פרויקט', 'עיצוב', 'ציור', 'הלחנה', 'מאמר', 'תזה', 'יצירה', 'עבודה סמינריונית'],
  },
  {
    kind: 'skill',
    words: ['תרגול', 'לתרגל', 'תרגילים', 'פתרון', 'פתרונות', 'נגינה', 'לנגן', 'גיטרה', 'פסנתר', 'כינור', 'תופים', 'דיבור', 'שיחה', 'הקלדה', 'תכנות', 'שחמט'],
  },
]

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * מנחש סוג למידה לפי השם של היעד, כהצעה בלבד: "תרגול פיזיקה" = מיומנות, "אוצר מילים באנגלית" = ידע.
 * מחזיר גם את המילה שבגללה, כדי להסביר. null = אין רמז ברור.
 */
export function guessKind(name: string): { kind: GoalKind; word: string } | null {
  const text = ` ${name.toLowerCase().replace(/[^\u05d0-\u05eaa-z\s]/g, ' ')} `
  for (const { kind, words } of KIND_HINTS) {
    for (const word of words) {
      // מילה שלמה, עם אותיות שימוש בתחילתה: "והתרגול", "לכתיבה"
      if (new RegExp(`\\s[והלבמש]{0,2}${escapeRe(word)}(?=\\s)`).test(text)) return { kind, word }
    }
  }
  return null
}

/**
 * אורך מפגש שמתאים למה שקורה בפועל: אם בשלושה מפגשים אחרונים (או יותר) תרגלתי הרבה פחות או יותר מהמתוכנן,
 * מציעים אורך חדש לפי החציון, מעוגל ל-5 דקות. null = אין מספיק נתונים או שהאורך מתאים.
 */
export function suggestLength(data: ScheduleData, goal: Goal): { minutes: Minutes; from: number } | null {
  const recent = (data.log ?? [])
    .filter((l) => l.goalId === goal.id && !l.reviewId)
    .sort((a, b) => b.date.localeCompare(a.date) || b.start - a.start)
    .slice(0, 5)
  if (recent.length < 3) return null
  const actual = recent.map((l) => l.end - l.start).sort((a, b) => a - b)
  const median = actual[Math.floor(actual.length / 2)]
  const planned = sessionLength(goal)
  const ratio = median / planned
  if (ratio >= 0.8 && ratio <= 1.25) return null
  const minutes = Math.max(15, Math.min(180, Math.round(median / 5) * 5))
  if (minutes === planned) return null
  return { minutes, from: recent.length }
}
