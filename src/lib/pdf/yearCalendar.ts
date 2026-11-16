import { buildTable, type Cell } from './grid'
import type { RawPage, RawWord } from './raw'
import { toHebrew, type HebrewMonth } from '../hebrew'

/**
 * קריאת לוח שנתי של מוסד: טבלה של אירוע, תאריך והערות
 * (חופשות, תחילת וסוף סמסטר, מבחנים, אירועים).
 *
 * בכל שורה יש עד שלושה עדים לתאריך: התאריך הלועזי, התאריך העברי ויום השבוע.
 * כשהם לא מסכימים (טעות הקלדה בקובץ) הולכים עם השניים שמסכימים, ומסבירים.
 */

export type CalendarKind = 'break' | 'semester' | 'exam' | 'event'

export interface CalendarItem {
  /** מזהה יציב בין גרסאות של הקובץ: לפיו גרסה מעודכנת מעדכנת תאריך במקום להוסיף כפילות */
  key: string
  kind: CalendarKind
  title: string
  /** YYYY-MM-DD. חסר = בקובץ עוד אין תאריך */
  from?: string
  to?: string
  /** לסוג semester: איזה קצה של איזה סמסטר */
  semester?: { key: 'a' | 'b'; edge: 'from' | 'to' }
  /** התאריך כמו שכתוב בקובץ */
  dateText: string
  note?: string
  /** מה לא הסתדר בתאריך, ומה הוחלט */
  warning?: string
  /** שורה שנראית שייכת לתוכנית אחרת או לשנה אחרת */
  foreign?: boolean
}

export interface YearCalendar {
  /** הכותרת שמעל הטבלה */
  title?: string
  /** שנת הלימודים: השנה הלועזית שבה היא מתחילה (תשפ"ז = 2026) */
  startYear?: number
  items: CalendarItem[]
}

const clean = (s: string) => s.replace(/[​-‏‪-‮⁦-⁩]/g, '').replace(/\s+/g, ' ').trim()

/** השורות של תא, מלמעלה למטה, כל אחת מימין לשמאל */
function linesOf(words: RawWord[]): string[] {
  const rows: RawWord[][] = []
  for (const w of [...words].sort((a, b) => b.y - a.y)) {
    const row = rows.find((r) => Math.abs(r[0].y - w.y) <= 3)
    if (row) row.push(w)
    else rows.push([w])
  }
  return rows.map((r) => clean(r.sort((a, b) => b.x - a.x).map((w) => w.text).join(' '))).filter(Boolean)
}

interface Row {
  lines: string[]
  dateText: string
  note: string
}

const HEADER = { event: /^אירוע$/, date: /^תאריך$/, note: /^הערות$/ }

function tablesOf(pages: RawPage[]) {
  return pages.map((p) => buildTable(p)).filter((t) => t !== null)
}

const cellText = (c: Cell) => linesOf(c.words).join(' ')

/** איזו עמודה היא מה, לפי שורת הכותרת */
function findColumns(cells: Cell[]): { event: number; date: number; note?: number; row: number } | null {
  const event = cells.find((c) => HEADER.event.test(cellText(c)))
  const date = cells.find((c) => c.r1 === event?.r1 && HEADER.date.test(cellText(c)))
  if (!event || !date) return null
  const note = cells.find((c) => c.r1 === event.r1 && HEADER.note.test(cellText(c)))
  return { event: event.c1, date: date.c1, note: note?.c1, row: event.r1 }
}

/** האם הקובץ הוא לוח שנתי (ולא מערכת שעות) */
export function isYearCalendar(pages: RawPage[]): boolean {
  return tablesOf(pages).some((t) => findColumns(t.cells) !== null)
}

function readRows(pages: RawPage[]): Row[] {
  const rows: Row[] = []
  let cols: ReturnType<typeof findColumns> = null
  for (const table of tablesOf(pages)) {
    const here = findColumns(table.cells)
    // בעמודי ההמשך אין שורת כותרת: העמודות נשארות כמו בעמוד הראשון
    if (here) cols = here
    if (!cols) continue
    for (let r = here ? here.row + 1 : 0; r < table.rows; r++) {
      const inRow = table.cells.filter((c) => c.r1 === r)
      const at = (col: number | undefined) =>
        col === undefined ? undefined : inRow.find((c) => c.c1 <= col && col <= c.c2)
      const event = at(cols.event)
      if (!event) continue
      const lines = linesOf(event.words)
      if (!lines.length) continue
      const date = at(cols.date)
      const note = at(cols.note)
      rows.push({
        lines,
        // תא שנמתח על כל השורה (כותרת ביניים): אין בו תאריך נפרד
        dateText: date && date !== event ? linesOf(date.words).join(' ') : '',
        note: note && note !== event ? linesOf(note.words).join(' ') : '',
      })
    }
  }
  return rows
}

// ---------- שנה ----------

const LETTER: Record<string, number> = {
  א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9,
  י: 10, כ: 20, ל: 30, מ: 40, נ: 50, ס: 60, ע: 70, פ: 80, צ: 90,
  ק: 100, ר: 200, ש: 300, ת: 400,
}

const gematria = (s: string) => [...s].reduce((sum, ch) => sum + (LETTER[ch] ?? 0), 0)

const HEBREW_YEAR = /תש[א-ת]?["״׳']?[א-ת]/g

/** כל השנים העבריות שמוזכרות בטקסט (תשפ"ז = 5787) */
const hebrewYears = (text: string) => [...text.matchAll(HEBREW_YEAR)].map((m) => 5000 + gematria(m[0]))

// ---------- תאריכים ----------

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

const isoPlus = (date: string, n: number) => {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

const weekdayOf = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

const dayGap = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)

const short = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return `${d}.${m}.${String(y).slice(2)}`
}

interface GregToken {
  d1: number
  d2?: number
  month: number
  year?: number
}

/** "11.10.26", "1.12", "3-4.6", "10-12.5" */
function gregTokens(text: string): GregToken[] {
  const out: GregToken[] = []
  for (const m of text.matchAll(/(?<![\d.])(\d{1,2})(?:\s*-\s*(\d{1,2}))?\.(\d{1,2})(?:\.(\d{2,4}))?(?![\d.])/g)) {
    const month = Number(m[3])
    const d1 = Number(m[1])
    if (month < 1 || month > 12 || d1 < 1 || d1 > 31) continue
    const year = m[4] ? (m[4].length === 2 ? 2000 + Number(m[4]) : Number(m[4])) : undefined
    out.push({ d1, d2: m[2] ? Number(m[2]) : undefined, month, year })
  }
  return out
}

const MONTHS: Array<[RegExp, HebrewMonth]> = [
  [/^תשרי/, 'tishrei'],
  [/^חשו?ון/, 'cheshvan'],
  [/^כסלו/, 'kislev'],
  [/^טבת/, 'tevet'],
  [/^שבט/, 'shvat'],
  [/^אדר\s+א['׳]/, 'adar1'],
  [/^אדר/, 'adar'],
  [/^ניסן/, 'nisan'],
  [/^אייר/, 'iyyar'],
  [/^סיו?ון/, 'sivan'],
  [/^תמוז/, 'tammuz'],
  [/^אב(?![א-ת])/, 'av'],
  [/^אלול/, 'elul'],
]

const DAY = `[א-ל](?:["״][א-ט]|['׳])`
const HEBREW_DATE = new RegExp(
  `(?<![א-ת"״'׳])(ר["״]ח|${DAY})(?:\\s*-\\s*(${DAY}))?,?\\s+ב?(תשרי|חשו?ון|כסלו|טבת|שבט|אדר(?:\\s+[אב]['׳])?|ניסן|אייר|סיו?ון|תמוז|אב(?![א-ת])|אלול)`,
  'g',
)

interface HebrewToken {
  d1: number
  d2?: number
  month: HebrewMonth
}

/** "כ"ד כסלו", "ג'-ה' אייר", "ה' באדר א'", "ר"ח אדר ב'" */
function hebrewTokens(text: string): HebrewToken[] {
  const out: HebrewToken[] = []
  for (const m of text.matchAll(HEBREW_DATE)) {
    const month = MONTHS.find(([re]) => re.test(m[3]))?.[1]
    if (!month) continue
    const num = (s: string) => (/^ר/.test(s) ? 1 : gematria(s))
    const d1 = num(m[1])
    if (d1 < 1 || d1 > 30) continue
    out.push({ d1, d2: m[2] ? num(m[2]) : undefined, month })
  }
  return out
}

const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

/** יום השבוע הראשון שמוזכר: "יום שלישי", "ימים שני-רביעי", "יום ה'" */
function firstWeekday(text: string): number | undefined {
  let best: { at: number; day: number } | undefined
  WEEKDAYS.forEach((name, day) => {
    const at = text.search(new RegExp(`(?<![א-ת])${name}(?![א-ת])`))
    if (at >= 0 && (!best || at < best.at)) best = { at, day }
  })
  const letter = /(?<![א-ת])יום\s+([א-ו])['׳]/.exec(text)
  if (letter && (!best || letter.index < best.at)) return gematria(letter[1]) - 1
  return best?.day
}

interface Resolved {
  from?: string
  to?: string
  warning?: string
}

function resolveDate(text: string, startYear: number | undefined, hebrew: Map<string, string>): Resolved {
  const greg = gregTokens(text)
  const heb = hebrewTokens(text)
  const weekday = firstWeekday(text)
  if (!greg.length && !heb.length) return {}

  // לועזי: ספטמבר עד דצמבר בשנה שבה הלימודים מתחילים, השאר בשנה שאחריה
  const yearOf = (t: GregToken) => t.year ?? (startYear === undefined ? undefined : t.month >= 9 ? startYear : startYear + 1)
  let g: { from: string; to: string } | undefined
  if (greg.length) {
    const first = greg[0]
    const last = greg[greg.length - 1]
    const y1 = yearOf(first)
    const y2 = yearOf(last) ?? y1
    if (y1 !== undefined && y2 !== undefined) {
      g = { from: iso(y1, first.month, first.d1), to: iso(y2, last.month, last.d2 ?? last.d1) }
    }
  }

  let h: { from: string; to: string } | undefined
  if (heb.length) {
    const first = heb[0]
    const last = heb[heb.length - 1]
    const from = hebrew.get(`${first.month}-${first.d1}`)
    const to = hebrew.get(`${last.month}-${last.d2 ?? last.d1}`)
    if (from) h = { from, to: to && to >= from ? to : from }
  }

  const fits = (date: string | undefined) => date !== undefined && (weekday === undefined || weekdayOf(date) === weekday)
  if (g && (!h || h.from === g.from)) {
    if (g.to < g.from) return { from: g.from, to: g.from, warning: `תאריך הסיום בקובץ (${text}) לפני ההתחלה. נלקח רק היום הראשון.` }
    return fits(g.from) || !heb.length ? g : { ...g, warning: `יום השבוע בקובץ לא תואם לתאריך ${short(g.from)}. כדאי לבדוק.` }
  }
  if (g && h) {
    // לועזי ועברי לא מסכימים: יום השבוע מכריע
    if (weekday !== undefined && weekdayOf(g.from) === weekday && weekdayOf(h.from) !== weekday) return g
    if (weekday !== undefined && weekdayOf(h.from) === weekday && weekdayOf(g.from) !== weekday) {
      // אותו אורך כמו בלועזי, כשבעברי כתוב רק יום אחד
      const to = h.to > h.from ? h.to : isoPlus(h.from, Math.max(0, dayGap(g.from, g.to)))
      return {
        from: h.from,
        to,
        warning: `בקובץ כתוב ${greg.map((t) => `${t.d1}${t.d2 ? `-${t.d2}` : ''}.${t.month}${t.year ? `.${String(t.year).slice(2)}` : ''}`).join(' - ')}, אבל התאריך העברי ויום השבוע יוצאים ${short(h.from)}${to > h.from ? ` עד ${short(to)}` : ''}. נלקח התאריך הזה.`,
      }
    }
    return { ...g, warning: `התאריך העברי בקובץ יוצא ${short(h.from)}, ולא ${short(g.from)}. נלקח התאריך הלועזי, וכדאי לבדוק.` }
  }
  if (h) return { ...h, warning: 'בקובץ אין תאריך לועזי. חושב מהתאריך העברי, וכדאי לבדוק.' }
  return {}
}

/** התאריך הלועזי של כל יום עברי בשנת הלימודים */
function hebrewMap(startYear: number): Map<string, string> {
  const out = new Map<string, string>()
  const end = Date.UTC(startYear + 1, 8, 30)
  for (let t = Date.UTC(startYear, 8, 1); t <= end; t += 86_400_000) {
    const d = new Date(t)
    const hd = toHebrew(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
    const key = `${hd.month}-${hd.day}`
    // שנת לימודים ארוכה משנה עברית: התאריך הראשון קובע (תשרי של תחילת השנה, לא של הבאה)
    if (!out.has(key)) out.set(key, d.toISOString().slice(0, 10))
  }
  return out
}

// ---------- סיווג ----------

const norm = (s: string) => s.replace(/[^א-ת0-9a-z]/gi, '')

function classify(title: string): Pick<CalendarItem, 'kind' | 'semester'> {
  // "סוף לימודים סדירים בסמסטר א'". מבחן סוף סמסטר הוא מבחן, לא סוף הסמסטר
  const end = /סוף\s+ה?לימודים.*?סמסטר\s*([אב])/.exec(title)
  if (end) return { kind: 'semester', semester: { key: end[1] === 'א' ? 'a' : 'b', edge: 'to' } }
  const start = /תחילת\s+סמסטר\s*([אב])/.exec(title)
  if (start) return { kind: 'semester', semester: { key: start[1] === 'א' ? 'a' : 'b', edge: 'from' } }
  if (/חופש/.test(title)) return { kind: 'break' }
  if (/מבחן|בחינה|בוחן|מועד\s+[אבג]['׳]/.test(title)) return { kind: 'exam' }
  return { kind: 'event' }
}

/** "ערב יום השואה ויום השואה" או "ערב ויום ירושלים", על יומיים: שם לכל יום */
function eveAndDay(text: string): [string, string] | undefined {
  const short = /^ערב\s+ויום\s+(.+)$/.exec(text)
  if (short) return [`ערב יום ${short[1]}`, `יום ${short[1]}`]
  const full = /^(ערב\s+.+?)\s+ו(יום\s+.+)$/.exec(text)
  return full ? [full[1], full[2]] : undefined
}

/** קורא את הלוח השנתי. שורות בלי תאריך נשארות ברשימה, בלי from */
export function parseYearCalendar(pages: RawPage[]): YearCalendar {
  const rows = readRows(pages)
  const tables = tablesOf(pages)
  // הכותרת: המילים שמעל הטבלה בעמוד הראשון
  const first = pages[0]
  const inTable = new Set(tables[0]?.cells.flatMap((c) => c.words) ?? [])
  const top = tables[0]?.ys[0] ?? 0
  const title = first ? linesOf(first.words.filter((w) => !inTable.has(w) && w.y > top)).join(' ') : ''

  const hy = hebrewYears(title)[0] ?? hebrewYears(rows.map((r) => r.lines.join(' ')).join(' '))[0]
  const explicit = rows.flatMap((r) => gregTokens(r.dateText)).find((t) => t.year !== undefined)
  const startYear =
    hy !== undefined ? hy - 3761 : explicit ? (explicit.month >= 9 ? explicit.year! : explicit.year! - 1) : undefined
  const hebrew = startYear === undefined ? new Map<string, string>() : hebrewMap(startYear)
  const thisYear = startYear === undefined ? undefined : startYear + 3761

  const items: CalendarItem[] = []
  const seen = new Map<string, number>()
  const keyFor = (kind: CalendarKind, text: string) => {
    const base = `${kind}:${norm(text)}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    // אותה שורה פעמיים בקובץ (שני ימי זום): השנייה מקבלת מספר
    return n === 1 ? base : `${base}#${n}`
  }
  let semesterStart = false
  /** "סוף לימודים סדירים ותחילת תקופת בחינות": מהיום שאחרי אין שיעורים */
  const examPeriods: Array<{ key: 'a' | 'b'; after: string }> = []

  for (const row of rows) {
    const text = row.lines.join(' ')
    const date = resolveDate(row.dateText, startYear, hebrew)
    const base = { dateText: row.dateText, note: row.note || undefined, warning: date.warning }
    // שורה על שנה אחרת (פתיחת השנה הבאה), או פתיחה של תוכנית אחרת
    const otherYear = thisYear !== undefined && hebrewYears(text).some((y) => y !== thisYear)
    let kind = classify(text)

    // תחילת הלימודים: הראשונה בקובץ היא תחילת סמסטר א'
    if (kind.kind === 'event' && /^תחילת\s+ה?לימודים/.test(text) && !semesterStart && !otherYear && !/קדם/.test(text)) {
      semesterStart = true
      kind = { kind: 'semester', semester: { key: 'a', edge: 'from' } }
    }
    const foreign = otherYear || (kind.kind === 'event' && /^(פתיחת|תחילת\s+ה?לימודים|כנס\s+פתיחת)/.test(text)) || undefined

    if (kind.kind === 'semester') {
      const { key, edge } = kind.semester!
      const name = `${edge === 'from' ? 'תחילת' : 'סוף'} סמסטר ${key === 'a' ? "א'" : "ב'"}`
      items.push({ ...base, ...kind, key: `semester:${key}:${edge}`, title: name, from: date.from, to: date.from })
      if (edge === 'to' && date.from && /תקופת\s+ה?בחינות/.test(text)) examPeriods.push({ key, after: date.from })
      continue
    }

    const days = date.from && date.to ? dayGap(date.from, date.to) + 1 : 1
    if (kind.kind !== 'break' && days > 1) {
      // כמה ימים בשורה אחת (ערב יום הזיכרון, יום הזיכרון, יום העצמאות): אירוע לכל יום
      const names = row.lines.length === days ? row.lines : days === 2 ? eveAndDay(text) : undefined
      for (let i = 0; i < days; i++) {
        const t = names?.[i] ?? text
        const day = isoPlus(date.from!, i)
        items.push({ ...base, kind: kind.kind, key: keyFor(kind.kind, t), title: t, from: day, to: day, foreign })
      }
      continue
    }
    items.push({ ...base, kind: kind.kind, key: keyFor(kind.kind, text), title: text, from: date.from, to: date.to, foreign })
  }

  // תקופת בחינות: מסוף הלימודים הסדירים עד תחילת הסמסטר הבא, או עד התאריך האחרון בקובץ.
  // בלי זה שיעורים שנתיים (שלא שייכים לסמסטר) היו ממשיכים להופיע בזמן הבחינות
  const lastDate = items.reduce((max, i) => (i.to && !i.foreign && i.to > max ? i.to : max), '')
  for (const p of examPeriods) {
    const next = items.find((i) => i.semester?.edge === 'from' && i.from && i.from > p.after)?.from
    const from = isoPlus(p.after, 1)
    const to = next ? isoPlus(next, -1) : lastDate
    if (!to || to < from) continue
    const name = `תקופת בחינות סמסטר ${p.key === 'a' ? "א'" : "ב'"}`
    const at = items.findIndex((i) => i.key === `semester:${p.key}:to`)
    items.splice(at + 1, 0, {
      key: `break:examperiod:${p.key}`,
      kind: 'break',
      title: name,
      from,
      to,
      dateText: '',
      note: next ? undefined : 'בקובץ אין תאריך סיום לתקופת הבחינות. נלקח התאריך האחרון שמופיע בו.',
    })
  }
  return { title: title || undefined, startYear, items }
}
