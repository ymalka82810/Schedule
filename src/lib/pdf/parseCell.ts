import type { Minutes } from '../../types'
import type { DraftOption } from './draft'
import type { RawWord } from './raw'

export interface Teacher {
  fullName: string
  /** שם המקצוע בלי יחידות לימוד: "מתמטיקה", "פיזיקה", "אנגלית" */
  subject: string
  room?: string
  /** רמה או פירוט מהטבלה: "5 יח'", "טרום בסיס א" */
  detail?: string
  /** כותרת הפרק בטבלה, כשהיא אומרת משהו על הקורס: "קורס סמסטר א' בלבד" */
  note?: string
}

/** מילים בלי אותיות שימוש בתחילתן, לצורך השוואה גמישה */
const roots = (s: string) =>
  normalizeSubject(s)
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 ? w.replace(/^[והלב]/, '') : w))

/**
 * האם שני שמות מקצוע הם אותו מקצוע. מקבל כתיב שונה וניסוח קצת שונה:
 * "מבוא למחשבים" = "מבוא למדעי המחשב", "פיסיקה" = "פיזיקה".
 */
export function sameSubject(a: string, b: string): boolean {
  const na = normalizeSubject(a)
  const nb = normalizeSubject(b)
  if (na === nb) return true
  const ra = roots(na)
  const rb = roots(nb)
  if (!ra.length || !rb.length || ra[0] !== rb[0]) return false
  if (ra.length === 1 || rb.length === 1) return false
  // מילה ראשונה זהה, ועוד מילה שאחת מתחילה בשנייה (מחשבים / מחשב)
  return ra.slice(1).some((x) => rb.slice(1).some((y) => x.startsWith(y) || y.startsWith(x)))
}

/** המרצים בטבלה שמלמדים את המקצוע */
export const teachersOf = (subject: string, all: Teacher[]) => all.filter((t) => sameSubject(t.subject, subject))

/** שורה אחת של טקסט בתוך תא, בסדר קריאה */
interface Line {
  y: number
  text: string
  font: string
  h: number
  /** המילים בסדר קריאה */
  words: RawWord[]
  x1: number
  x2: number
}

export interface Block {
  text: string
  font: string
  /** השורות ההגיוניות בקטע (אחרי חיבור שורות שנשברו בגלל רוחב התא) */
  lines: string[]
}

const SPELLING: Record<string, string> = { פיסיקה: 'פיזיקה' }

/** מאחד כתיב ומנקה גרשיים וסימנים בקצוות */
export function normalizeSubject(s: string): string {
  const t = s.replace(/^[^\u05d0-\u05ea]+/, '').replace(/[^\u05d0-\u05ea]+$/, '').trim()
  return SPELLING[t] ?? t
}

const HEBREW = /[\u05d0-\u05ea]/

/**
 * סדר הקריאה של המילים בשורה: מימין לשמאל, חוץ משורה בלי אף אות עברית
 * ("Room 14", "Mr. Cohen", "8:00 – 8:45") שנקראת משמאל לימין.
 */
export function readingOrder(words: RawWord[]): RawWord[] {
  const rtl = words.some((w) => HEBREW.test(w.text))
  return [...words].sort((a, b) => (rtl ? b.x - a.x : a.x - b.x))
}

function groupLines(words: RawWord[]): Line[] {
  const sorted = [...words].sort((a, b) => b.y - a.y || b.x - a.x)
  const lines: Array<{ y: number; h: number; words: RawWord[] }> = []
  for (const w of sorted) {
    const last = lines[lines.length - 1]
    if (last && Math.abs(last.y - w.y) < Math.max(2, w.h * 0.4)) last.words.push(w)
    else lines.push({ y: w.y, h: w.h, words: [w] })
  }
  return lines.map((l) => {
    let ws = readingOrder(l.words)
    // "/" שהצטייר בצד ימין של שורה ("/ פיזיקה") שייך לסוף השורה: "פיזיקה /"
    if (ws.length >= 2 && ws[0].text === '/') ws = [...ws.slice(1), ws[0]]
    return {
      y: l.y,
      h: l.h,
      words: ws,
      text: ws.map((w) => w.text).join(' '),
      font: ws[0].font,
      x1: Math.min(...ws.map((w) => w.x)),
      x2: Math.max(...ws.map((w) => w.x + w.w)),
    }
  })
}

/** גבולות התא, כדי לדעת מתי שורה נשברה בגלל רוחב */
export interface CellBox {
  x1: number
  x2: number
}

export interface SplitOptions {
  box?: CellBox
  /** כמה שורות יש בדרך כלל בתא בטבלה הזו. תא עם יותר שורות כנראה נשבר בגלל רוחב */
  typicalLines?: number
  /** מילים מוכרות (מהמסמך ומקצועות נפוצים), לזיהוי מילה שנשברה באמצע */
  vocab?: Set<string>
}

/** מקצועות נפוצים: עוזרים לזהות מילה שנשברה באמצע ("היסטורי" + "ה") */
export const KNOWN_WORDS = new Set(
  (
    'מתמטיקה אנגלית היסטוריה פיזיקה כימיה ביולוגיה ספרות לשון אזרחות גיאוגרפיה מחשבים ' +
    'אמנות מוזיקה מוסיקה תלמוד גמרא משנה הלכה מחשבת ערבית צרפתית ספרייה ספריה כלכלה ' +
    'סטטיסטיקה פסיכולוגיה סוציולוגיה פילוסופיה מדעים טכנולוגיה רובוטיקה אלגברה גאומטריה ' +
    'גיאומטריה ליניארית אינפי חשבון חינוך גופני תכנות הנדסה מכניקה אלקטרוניקה'
  ).split(' '),
)

const letters = (s: string) => s.replace(/[^\u05d0-\u05ea]/g, '')

function merge(prev: Line, next: Line, text: string): Line {
  return {
    ...prev,
    text,
    words: [...prev.words, ...next.words],
    x1: Math.min(prev.x1, next.x1),
    x2: Math.max(prev.x2, next.x2),
  }
}

/**
 * מחבר שורות שנשברו בגלל רוחב התא.
 * 1. מילה שנשברה באמצע ("מתמטיק" + "ה", "אברה" + "ם") מתחברת בלי רווח: כשהחלק השני מתחיל
 *    באות סופית, כשהראשון נגמר באות שלא מסיימת מילה, או כשהחיבור הוא מילה מוכרת.
 * 2. שורה שהמילה הראשונה שלה לא הייתה נכנסת בשורה הקודמת היא המשך שלה, אבל רק כל עוד
 *    בתא יש יותר שורות מהרגיל בטבלה (אחרת זו ירידת שורה מכוונת: מקצוע / מורה / חדר).
 */
function joinWraps(lines: Line[], opts: SplitOptions = {}): Line[] {
  if (lines.length < 2) return lines
  const vocab = opts.vocab ?? KNOWN_WORDS
  let out: Line[] = [lines[0]]
  for (const next of lines.slice(1)) {
    const prev = out[out.length - 1]
    const tail = prev.words[prev.words.length - 1].text
    const head = next.words[0].text
    const lt = letters(tail)
    const lh = letters(head)
    const hebrewEdge = /[\u05d0-\u05ea]$/.test(tail) && /^[\u05d0-\u05ea]/.test(head)
    const midWord =
      prev.font === next.font &&
      hebrewEdge &&
      lt.length >= 2 &&
      (/^[ךםןףץ]/.test(head) || /[כמנפצ]$/.test(tail) || (lh.length <= 3 && (vocab.has(lt + lh) || KNOWN_WORDS.has(lt + lh))))
    if (midWord) out[out.length - 1] = merge(prev, next, prev.text + next.text)
    else out.push(next)
  }

  const box = opts.box
  if (!box || out.length < 2) return out
  const gaps = out.map((l) => Math.min(l.x1 - box.x1, box.x2 - l.x2)).filter((g) => g >= 0)
  const pad = Math.min(6, gaps.length ? Math.min(...gaps) : 6)
  const inner = box.x2 - box.x1 - 2 * pad
  const wraps = (i: number) => {
    const prev = out[i]
    const next = out[i + 1]
    return prev.font === next.font && prev.x2 - prev.x1 + prev.h * 0.25 + next.words[0].w > inner + 0.5
  }
  const limit = opts.typicalLines ?? 1
  while (out.length > limit) {
    // מחברים מלמעלה: שם המקצוע, שבשורה הראשונה, הוא בדרך כלל הארוך שנשבר
    let pick = -1
    for (let i = 0; i + 1 < out.length && pick < 0; i++) if (wraps(i)) pick = i
    // כשהמידות לא עוזרות (יש תוכנות שמציירות את התא רחב מהטקסט): שתי שורות של מילים מוכרות
    // הן כנראה שם מקצוע אחד שנשבר ("חינוך" + "גופני")
    const known = (l: Line) => l.words.every((w) => KNOWN_WORDS.has(letters(w.text)))
    for (let i = 0; i + 1 < out.length && pick < 0; i++) if (known(out[i]) && known(out[i + 1])) pick = i
    if (pick < 0) break
    const joined = merge(out[pick], out[pick + 1], `${out[pick].text} ${out[pick + 1].text}`)
    out = [...out.slice(0, pick), joined, ...out.slice(pick + 2)]
  }
  return out
}

/** כמה שורות טקסט יש בתא */
export const lineCount = (words: RawWord[]) => groupLines(words).length

/** מפצל את המילים בתא לקטעים נפרדים: רווח אנכי גדול, או החלפת גופן עם רווח גדול מרווח שורה רגיל */
export function splitBlocks(words: RawWord[], opts: SplitOptions = {}): Block[] {
  const lines = groupLines(words)
  const blocks: Block[] = []
  let current: Line[] = []
  const flush = () => {
    if (current.length) {
      const logical = joinWraps(current, opts)
      blocks.push({ text: logical.map((l) => l.text).join(' '), font: current[0].font, lines: logical.map((l) => l.text) })
      current = []
    }
  }
  for (const line of lines) {
    const prev = current[current.length - 1]
    if (prev) {
      const gap = prev.y - line.y
      const pitch = Math.max(prev.h, line.h) * 1.3
      const fontChanged = prev.font !== line.font
      if (gap > pitch * 1.5 || (fontChanged && gap > pitch * 1.15)) flush()
    }
    current.push(line)
  }
  flush()

  // "/" בקצה של קטע (בתחילתו או בסופו) מחבר אותו לקטע השכן: "פיזיקה /" + "מבוא למחשבים" הם קטע אחד
  const joined: Block[] = []
  for (const b of blocks) {
    const prev = joined[joined.length - 1]
    const slashEdge = (t: string) => /^\s*\/|\/\s*$/.test(t)
    if (prev && (slashEdge(prev.text) || slashEdge(b.text))) {
      prev.text = `${prev.text} ${b.text}`
      prev.lines = [...prev.lines, ...b.lines]
    } else joined.push({ ...b })
  }
  return joined
}

export interface ParsedOption extends DraftOption {
  /** הגבלת זמן מתוך ההערות בתא, בדקות מחצות. "עד 20:45", "החל משעה 13:00" */
  from?: Minutes
  until?: Minutes
}

const toMin = (h: string, m: string): Minutes => Number(h) * 60 + Number(m)

const clean = (s: string) =>
  s
    .replace(/[\u200e\u200f]/g, '')
    .replace(/[\u2013\u2014\u05be]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()

/** מוצא מרצים מוכרים בטקסט (שם מלא או שם משפחה) */
function findTeachers(text: string, teachers: Teacher[]): { rest: string; found: Teacher[] } {
  let rest = ` ${text} `
  const found: Teacher[] = []
  const bySurname = new Map<string, Teacher[]>()
  for (const t of teachers) {
    const last = t.fullName.split(' ').at(-1)!
    bySurname.set(last, [...(bySurname.get(last) ?? []), t])
  }

  // קודם שמות מלאים, כדי ש"רמי רחמים" לא יישאר חצי
  for (const t of teachers) {
    const re = new RegExp(`(?<=[\\s,\\-])${t.fullName.replace(/\s+/g, '\\s+')}(?=[\\s,\\-])`)
    if (re.test(rest)) {
      rest = rest.replace(re, ' ')
      if (!found.some((f) => f.fullName === t.fullName)) found.push(t)
    }
  }
  for (const [surname, list] of bySurname) {
    const re = new RegExp(`(?<=[\\s,\\-])${surname}(?=[\\s,\\-])`)
    if (re.test(rest)) {
      rest = rest.replace(re, ' ')
      for (const t of list) if (!found.some((f) => f.fullName === t.fullName)) found.push(t)
    }
  }
  return { rest: rest.replace(/\s*,\s*/g, ' ').replace(/\s+/g, ' ').trim(), found }
}

/** מוצא את החדר של מרצה למקצוע הנתון */
export function roomFor(teacher: Teacher | undefined, subject: string, all: Teacher[]): string | undefined {
  if (!teacher) return undefined
  const mine = all.filter((t) => t.fullName === teacher.fullName)
  const match = mine.find((t) => sameSubject(t.subject, subject)) ?? (mine.length === 1 ? mine[0] : undefined)
  return match?.room
}

/**
 * סוגי שיעור שמזהים בתא: המילה עצמה וקיצורים נפוצים. כל השאר (סדנה, סמינר) נשאר חלק מהשם,
 * כי לפעמים זה שם הקורס עצמו.
 */
const KIND_WORDS: Array<{ kind: string; re: string }> = [
  { kind: 'הרצאה', re: "הרצאה|הרצאות|הרצ['\u05f3\u2019]" },
  { kind: 'תרגול', re: "תרגול|תרגולים|תרגיל|תרג['\u05f3\u2019]|תר\\." },
  { kind: 'מעבדה', re: "מעבדה|מעבדות|מעב['\u05f3\u2019]|מע\\." },
]

export const LESSON_KINDS = KIND_WORDS.map((k) => k.kind)

/** סוג שיעור מתוך עמודה שכתוב בה רק הסוג: "תרגיל" = תרגול */
export const kindOf = (text: string): string | undefined =>
  text.trim() ? (detectKind(`שיעור ${text}`).kind ?? text.trim()) : undefined

/**
 * מוצא בטקסט של שיעור את הסוג שלו (הרצאה, תרגול, מעבדה) ומוציא אותו מהשם:
 * "פיזיקה תרגול" = פיזיקה, תרגול. "מעבדה בפיזיקה" = פיזיקה, מעבדה. "(תרג')" גם עובד.
 * אם בלי המילה לא נשאר שם, המילה היא השם ואין סוג.
 */
export function detectKind(text: string): { rest: string; kind?: string } {
  for (const { kind, re } of KIND_WORDS) {
    // מילה שלמה: לפניה תחילת טקסט, רווח, מקף או סוגריים, ואחריה אותו דבר. ו' החיבור מותרת לפניה
    const word = new RegExp(`(^|[\\s\\-\\u2013(,])ו?(?:${re})(?=$|[\\s\\-\\u2013),:])`)
    const m = word.exec(text)
    if (!m) continue
    let rest = text.slice(0, m.index) + m[1] + ' ' + text.slice(m.index + m[0].length)
    // "מעבדה בפיזיקה", "תרגול למתמטיקה": אות היחס שייכת למילת הסוג
    const after = text.slice(m.index + m[0].length).match(/^\s+[בל]([\u05d0-\u05ea]{2,})/)
    if (after) {
      rest = text.slice(0, m.index) + m[1] + ' ' + after[1] + text.slice(m.index + m[0].length + after[0].length)
    }
    rest = rest
      .replace(/\(\s*\)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!/[\u05d0-\u05eaA-Za-z]/.test(rest.replace(/[-\u2013,\s]/g, ''))) return { rest: text }
    return { rest, kind }
  }
  return { rest: text }
}

function parsePart(part: string, teachers: Teacher[]): ParsedOption[] {
  let text = part

  const detected = detectKind(text)
  text = detected.rest
  const kind = detected.kind

  // קבוצה: "קבוצה 1", "קב' 3", "קב 3"
  let group: string | undefined
  text = text.replace(/(?:קבוצה|קב['\u05f3\u2019]?\.?)\s*(\d+)/, (_m, n: string) => {
    group = `קבוצה ${n}`
    return ' '
  })

  const { rest, found } = findTeachers(text, teachers)
  let name = rest
  let teacherText: string | undefined

  let roomText: string | undefined
  if (!found.length) {
    const inline = inlineDetails(name)
    name = inline.name
    teacherText = inline.teacher
    roomText = inline.room
    // אין מרצה מוכר: "מקצוע - שם"
    const dash = name.split(/\s*-\s*/)
    if (!teacherText && dash.length === 2 && dash[0] && dash[1]) {
      name = dash[0]
      teacherText = dash[1]
    }
  }

  name = name.replace(/^[\s\-,.]+|[\s\-,.]+$/g, '').trim()
  if (!name) return []

  if (found.length) {
    return found.map((t) => ({
      name,
      teacher: t.fullName,
      group,
      room: roomFor(t, name, teachers),
      ...(kind ? { kind } : {}),
    }))
  }
  return [{ name, teacher: teacherText, group, ...(roomText ? { room: roomText } : {}), ...(kind ? { kind } : {}) }]
}

const TITLE = /(?:^|\s)(?:Mr|Mrs|Ms|Dr|Prof|Teacher)\.?(?=\s|$)|^(?:המורה:?)\s*/gi
const ROOM_WORD = /(?:^|\s)(?:חדר|Room|Rm\.?)\s*:?\s*(\S+)/i
/** קוד קורס: "382.1.1101.01", "02140132" */
export const COURSE_CODE = /(?:^|\s)\d[\d.-]{4,}\d(?=\s|$)/g

/**
 * פרטים בתוך שורה אחת כשאין טבלת מרצים: "מתמטיקה (כהן) 12", "אנגלית (לוי) חדר 14",
 * "Math Mr. Cohen Room 14". מורה בסוגריים (גם הפוכים, כמו שיוצא לפעמים מ-PDF), חדר אחרי
 * המילה "חדר", ומספר בודד בסוף כשכבר נמצא מורה בסוגריים.
 */
export function inlineDetails(text: string): { name: string; teacher?: string; room?: string } {
  let rest = ` ${text} `.replace(COURSE_CODE, ' ')
  let teacher: string | undefined
  let room: string | undefined
  rest = rest.replace(ROOM_WORD, (_m, r: string) => {
    room = r
    return ' '
  })
  const paren = /[()]\s*([^()]*[\u05d0-\u05eaA-Za-z][^()]*?)\s*[()]/.exec(rest)
  if (paren && !/קבוצה|קב['\u05f3]|הרצ|תרג|מעב/.test(paren[1])) {
    teacher = paren[1].trim()
    // מה שאחרי הסוגריים הוא החדר: "חינוך גופני (דהן) אולם"
    const after = rest.slice(paren.index + paren[0].length).trim()
    if (!room && after && after.split(/\s+/).length <= 2) room = after
    rest = rest.slice(0, paren.index) + ' ' + (room === after ? '' : after)
  }
  // "Mr. Cohen", וגם "Cohen Mr." כשסדר המילים יצא הפוך בשורה מעורבת
  const title =
    /(?:^|\s)(?:Mr|Mrs|Ms|Dr|Prof)\.?\s+([A-Za-z\u05d0-\u05ea'"-]+)/i.exec(rest) ??
    /(?:^|\s)([A-Za-z\u05d0-\u05ea'"-]+)\s+(?:Mr|Mrs|Ms|Dr|Prof)\.?(?=\s|$)/i.exec(rest)
  if (!teacher && title) {
    teacher = title[1]
    rest = rest.replace(title[0], ' ')
  }
  if (teacher && !room) {
    rest = rest.replace(/\s(\d{1,4}[א-ת]?)\s*$/, (_m, r: string) => {
      room = r
      return ' '
    })
  }
  return { name: rest.replace(/\s+/g, ' ').trim(), teacher, room }
}

const ROOM_LINE = /^(?:(?:חדר|כיתה|Room|Rm\.?)\s*:?\s*\S+|\d{1,4}[א-ת]?|מעבדה.*|אולם.*|ספריה|ספרייה|Lab.*|Gym)$/i

/**
 * תא שבנוי בשורות, כשאין טבלת מרצים: שורה ראשונה = מקצוע, ובשורות הבאות מורה, חדר וקוד קורס.
 * "מתמטיקה / כהן / 12", "Math / Mr. Cohen / Room 14", "חדו"א 1 / 201.1.9711.10".
 */
export function parseLines(lines: string[], teachers: Teacher[]): ParsedOption[] {
  const [first, ...more] = lines.map(clean).filter(Boolean)
  const base = parseBlockText(first ?? '', teachers)
  if (base.length !== 1) return parseBlockText(lines.join(' '), teachers)
  const o = { ...base[0] }
  for (const line of more) {
    const t = line.replace(COURSE_CODE, ' ').trim()
    if (!t) continue
    if (!o.room && ROOM_LINE.test(t)) {
      o.room = t.replace(/^(?:חדר|Room|Rm\.?)\s*:?\s*/i, '')
      continue
    }
    const inline = inlineDetails(t)
    if (!o.teacher && (inline.teacher || inline.name)) {
      o.teacher = (inline.teacher ?? inline.name).replace(TITLE, '').trim()
      if (inline.room && !o.room) o.room = inline.room
      continue
    }
    if (inline.room && !o.room) o.room = inline.room
  }
  return [o]
}

/** מפענח קטע טקסט אחד מתא: יכול להניב כמה אפשרויות (מקצועות במקביל, כמה מרצים) */
export function parseBlockText(raw: string, teachers: Teacher[]): ParsedOption[] {
  let text = clean(raw)

  let until: Minutes | undefined
  let from: Minutes | undefined
  text = text.replace(/עד\s*(\d{1,2}):(\d{2})/, (_m, h: string, m: string) => {
    until = toMin(h, m)
    return ' '
  })
  text = text.replace(/החל\s*(?:מ-?\s*)?(?:שעה|שעת)?\s*(\d{1,2}):(\d{2})/, (_m, h: string, m: string) => {
    from = toMin(h, m)
    return ' '
  })
  // "החל משעה" כשהשעה נפרדה במילה אחרת
  text = text.replace(/החל\s*(?:מ-?\s*)?(?:שעה|שעת)?\s*$/, ' ')

  const parts = text
    .replace(/\//g, ' / ')
    .split(' / ')
    .map((p) => clean(p))
    .filter(Boolean)

  const out: ParsedOption[] = []
  for (const part of parts) for (const o of parsePart(part, teachers)) out.push({ ...o, from, until })
  return out
}
