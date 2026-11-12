import type { Minutes } from '../../types'
import type { DraftOption } from './draft'
import type { RawWord } from './raw'

export interface Teacher {
  fullName: string
  /** שם המקצוע בלי יחידות לימוד: "מתמטיקה", "פיזיקה", "אנגלית" */
  subject: string
  room?: string
}

/** שורה אחת של טקסט בתוך תא, בסדר קריאה מימין לשמאל */
interface Line {
  y: number
  text: string
  font: string
  h: number
}

export interface Block {
  text: string
  font: string
}

const SPELLING: Record<string, string> = { פיסיקה: 'פיזיקה' }

/** מאחד כתיב ומנקה גרשיים וסימנים בקצוות */
export function normalizeSubject(s: string): string {
  const t = s.replace(/^[^\u05d0-\u05ea]+/, '').replace(/[^\u05d0-\u05ea]+$/, '').trim()
  return SPELLING[t] ?? t
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
    // מימין לשמאל: x גדול קודם
    let ws = [...l.words].sort((a, b) => b.x - a.x)
    // "/" שהצטייר בצד ימין של שורה ("/ פיזיקה") שייך לסוף השורה: "פיזיקה /"
    if (ws.length >= 2 && ws[0].text === '/') ws = [...ws.slice(1), ws[0]]
    return { y: l.y, h: l.h, text: ws.map((w) => w.text).join(' '), font: ws[0].font }
  })
}

/** מפצל את המילים בתא לקטעים נפרדים: רווח אנכי גדול, או החלפת גופן עם רווח גדול מרווח שורה רגיל */
export function splitBlocks(words: RawWord[]): Block[] {
  const lines = groupLines(words)
  const blocks: Block[] = []
  let current: Line[] = []
  const flush = () => {
    if (current.length) {
      blocks.push({ text: current.map((l) => l.text).join(' '), font: current[0].font })
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
    if (prev && (slashEdge(prev.text) || slashEdge(b.text))) prev.text = `${prev.text} ${b.text}`
    else joined.push({ ...b })
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
  const match = mine.find((t) => t.subject === normalizeSubject(subject)) ?? (mine.length === 1 ? mine[0] : undefined)
  return match?.room
}

function parsePart(part: string, teachers: Teacher[]): ParsedOption[] {
  let text = part

  // קבוצה: "קבוצה 1", "קב' 3", "קב 3"
  let group: string | undefined
  text = text.replace(/(?:קבוצה|קב['\u05f3\u2019]?\.?)\s*(\d+)/, (_m, n: string) => {
    group = `קבוצה ${n}`
    return ' '
  })

  const { rest, found } = findTeachers(text, teachers)
  let name = rest
  let teacherText: string | undefined

  if (!found.length) {
    // אין מרצה מוכר: "מקצוע - שם"
    const dash = name.split(/\s*-\s*/)
    if (dash.length === 2 && dash[0] && dash[1]) {
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
    }))
  }
  return [{ name, teacher: teacherText, group }]
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
