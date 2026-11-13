import type { DayIndex, Minutes } from '../../types'
import type { DraftItem, DraftOption, DraftSchedule } from './draft'
import { buildTable, type Cell, type Table } from './grid'
import { normalizeSubject, parseBlockText, splitBlocks, type ParsedOption, type Teacher } from './parseCell'
import type { RawPage, RawWord } from './raw'

const DAY_LETTERS: Record<string, DayIndex> = { א: 0, ב: 1, ג: 2, ד: 3, ה: 4, ו: 5 }
const TIME_RANGE = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/

const toMin = (h: string, m: string): Minutes => Number(h) * 60 + Number(m)

/** טקסט התא בסדר קריאה: שורות מלמעלה למטה, בכל שורה מימין לשמאל */
function cellText(cell: Cell): string {
  const sorted = [...cell.words].sort((a, b) => b.y - a.y || b.x - a.x)
  const lines: RawWord[][] = []
  for (const w of sorted) {
    const last = lines[lines.length - 1]
    if (last && Math.abs(last[0].y - w.y) < Math.max(2, w.h * 0.4)) last.push(w)
    else lines.push([w])
  }
  return lines
    .map((l) => [...l].sort((a, b) => b.x - a.x).map((w) => w.text).join(' '))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------- עמוד מרצים ----------

const HEADER_WORDS = /^(מקצוע|כיתה|חדר|מרצה|צוות)/

export function parseTeachers(table: Table): Teacher[] {
  const out: Teacher[] = []
  const byRow = new Map<number, Cell[]>()
  for (const cell of table.cells) {
    if (cell.r1 !== cell.r2 || !cell.words.length) continue
    byRow.set(cell.r1, [...(byRow.get(cell.r1) ?? []), cell])
  }
  let section: string | undefined
  for (const r of [...byRow.keys()].sort((a, b) => a - b)) {
    const cells = byRow.get(r)!
    // שורה עם תא אחד בלבד היא כותרת פרק ("מתמטיקה", "קורס סמסטר א' בלבד")
    if (cells.length === 1) {
      section = cellText(cells[0])
      continue
    }
    // מימין לשמאל: מרצה | מקצוע | כיתה (הכיתה יכולה לחסור)
    const ordered = [...cells].sort((a, b) => b.c1 - a.c1).map(cellText)
    if (ordered.length < 2) continue
    const [fullName, subjectRaw, room = ''] = ordered
    if (ordered.some((t) => HEADER_WORDS.test(t))) continue
    if (room && !/\d/.test(room)) continue
    const subject = normalizeSubject(subjectRaw.split(/\d|[-–]/)[0])
    if (!fullName || !subject || /\d/.test(fullName)) continue
    // הפירוט = מה שנשאר אחרי מילות המקצוע: "5 יח", "טרום בסיס א"
    const tokens = subjectRaw.replace(/^[^\u05d0-\u05ea\d]+/, '').split(/\s+/)
    const detail = tokens
      .slice(subject.split(' ').length)
      .join(' ')
      .replace(/^[\s\-–']+|[\s\-–]+$/g, '')
      .trim()
    const note = section && /סמסטר|בלבד|שבועיים/.test(section) ? section : undefined
    out.push({
      fullName,
      subject,
      room: room || undefined,
      detail: detail ? (/^\d+\s*יח$/.test(detail) ? `${detail}'` : detail) : undefined,
      note,
    })
  }
  return out
}

// ---------- מערכת שעות ----------

interface Timetable {
  dayOfCol: Map<number, DayIndex>
  timeCol: number
  headerRow: number
  rowTimes: Map<number, { start: Minutes; end: Minutes }>
}

/**
 * הימים בטבלה רצופים. אם רוב שמות הימים זוהו (למשל בסריקה, שבה "ב'" נקרא כמקף),
 * משלימים את העמודות שביניהם לפי הסדר: בטבלה מימין לשמאל יום + עמודה קבוע.
 */
export function fillDays(dayOfCol: Map<number, DayIndex>): Map<number, DayIndex> {
  const pairs = [...dayOfCol]
  for (const dir of [1, -1]) {
    const k = pairs[0][1] + dir * pairs[0][0]
    if (!pairs.every(([c, d]) => d + dir * c === k)) continue
    const cols = pairs.map(([c]) => c)
    const out = new Map(dayOfCol)
    for (let c = Math.min(...cols); c <= Math.max(...cols); c++) {
      const d = k - dir * c
      if (!out.has(c) && d >= 0 && d <= 5) out.set(c, d as DayIndex)
    }
    return out
  }
  return dayOfCol
}

function findTimetable(table: Table): Timetable | null {
  // שורת הימים: השורה עם הכי הרבה תאים שהם אות יום
  let headerRow = -1
  let best = 0
  let dayOfCol = new Map<number, DayIndex>()
  for (let r = 0; r < Math.min(table.rows, 3); r++) {
    const map = new Map<number, DayIndex>()
    for (const cell of table.cells) {
      if (cell.r1 !== r || cell.c1 !== cell.c2) continue
      const letters = cellText(cell).replace(/[^\u05d0-\u05ea]/g, '')
      if (letters.length === 1 && letters in DAY_LETTERS) map.set(cell.c1, DAY_LETTERS[letters])
    }
    if (map.size > best) {
      best = map.size
      headerRow = r
      dayOfCol = map
    }
  }
  if (best < 3) return null
  dayOfCol = fillDays(dayOfCol)

  // עמודת השעות: זו שמכילה הכי הרבה טווחי שעות
  const counts = new Map<number, number>()
  const rowTimes = new Map<number, { start: Minutes; end: Minutes }>()
  for (const cell of table.cells) {
    const m = TIME_RANGE.exec(cellText(cell))
    if (!m || cell.r1 <= headerRow) continue
    counts.set(cell.c1, (counts.get(cell.c1) ?? 0) + 1)
  }
  let timeCol = -1
  let most = 0
  for (const [c, n] of counts) {
    if (n > most) {
      most = n
      timeCol = c
    }
  }
  if (timeCol < 0 || most < 2) return null

  for (const cell of table.cells) {
    if (cell.c1 > timeCol || cell.c2 < timeCol) continue
    const m = TIME_RANGE.exec(cellText(cell))
    if (!m) continue
    const start = toMin(m[1], m[2])
    const end = toMin(m[3], m[4])
    for (let r = cell.r1; r <= cell.r2; r++) rowTimes.set(r, { start, end })
  }

  return { dayOfCol, timeCol, headerRow, rowTimes }
}

const optionKey = (o: DraftOption) => `${o.name}|${o.teacher ?? ''}|${o.group ?? ''}|${o.room ?? ''}|${o.kind ?? ''}`
const signature = (opts: DraftOption[]) => opts.map(optionKey).sort().join('#')

let seq = 0
const nextId = () => `d${++seq}`

function parseTimetable(table: Table, tt: Timetable, teachers: Teacher[], warnings: string[]): DraftItem[] {
  const pieces: DraftItem[] = []

  for (const cell of table.cells) {
    const day = tt.dayOfCol.get(cell.c1)
    if (day === undefined || cell.c1 !== cell.c2) continue
    if (cell.r1 <= tt.headerRow || !cell.words.length) continue

    const blocks = splitBlocks(cell.words)
    const parsed: ParsedOption[] = blocks.flatMap((b) => parseBlockText(b.text, teachers))
    const raw = blocks.map((b) => b.text).join(' | ')
    if (!parsed.length) {
      warnings.push(`לא הצלחתי לפענח את התא: "${raw}"`)
      continue
    }

    // כמה בלוקים או "/" בתא = שיעורים במקביל. בלוק אחד בלי "/" = שיעור יחיד
    // מילה שזוהתה בסריקה בביטחון נמוך: כדאי לבדוק מול המקור
    const check = blocks.length > 1 || cell.words.some((w) => w.doubt)

    for (let r = cell.r1; r <= cell.r2; r++) {
      const time = tt.rowTimes.get(r)
      if (!time) continue

      // חותכים את השורה לפי "עד" / "החל מ" של כל אפשרות
      const cuts = new Set<number>([time.start, time.end])
      for (const o of parsed) {
        if (o.from !== undefined && o.from > time.start && o.from < time.end) cuts.add(o.from)
        if (o.until !== undefined && o.until > time.start && o.until < time.end) cuts.add(o.until)
      }
      const points = [...cuts].sort((a, b) => a - b)
      for (let i = 0; i + 1 < points.length; i++) {
        const s = points[i]
        const e = points[i + 1]
        const active = parsed.filter((o) => (o.from ?? -Infinity) <= s && e <= (o.until ?? Infinity))
        if (!active.length) continue
        pieces.push({
          id: nextId(),
          day,
          start: s,
          end: e,
          options: active.map(({ name, teacher, group, room }) => ({ name, teacher, group, room })),
          raw,
          check: check || undefined,
        })
      }
    }
  }

  // איחוד שורות רצופות עם אותן אפשרויות. הפסקה בין שורות מפרידה בין בלוקים
  pieces.sort((a, b) => a.day - b.day || a.start - b.start)
  const merged: DraftItem[] = []
  for (const p of pieces) {
    const prev = merged[merged.length - 1]
    if (prev && prev.day === p.day && prev.end === p.start && signature(prev.options) === signature(p.options)) {
      prev.end = p.end
      prev.check = prev.check || p.check
    } else {
      merged.push({ ...p })
    }
  }
  return merged
}

/** תאריך בשם הקובץ: "מעודכנת_נכון_לתאריך_18_10_2026.pdf" */
export function dateFromFileName(name: string): string | undefined {
  const m = /(?<!\d)(\d{1,2})[._\- ](\d{1,2})[._\- ](\d{4})(?!\d)/.exec(name)
  return m ? `${Number(m[1])}.${Number(m[2])}.${m[3]}` : undefined
}

const DATE = /(?<!\d)(\d{1,2})[./](\d{1,2})[./](\d{4})(?!\d)/

/**
 * התאריך של הגרסה ("מעודכנת נכון לתאריך 18.10.2026"). מחפשים קודם ליד המילה "מעודכנת",
 * ואם אין, את התאריך הראשון בעמוד. כל מילה נבדקת לבד, כי סדר המילים בשכבת הטקסט לא אמין.
 */
export function findVersionDate(pages: RawPage[]): string | undefined {
  for (const page of pages) {
    const dates = page.words
      .map((w) => ({ w, m: DATE.exec(w.text) }))
      .filter((d): d is { w: RawWord; m: RegExpExecArray } => d.m !== null)
    if (!dates.length) continue
    const marker = page.words.find((w) => /מעודכנ/.test(w.text))
    const pick = marker
      ? [...dates].sort((a, b) => Math.abs(a.w.y - marker.y) - Math.abs(b.w.y - marker.y))[0]
      : dates[0]
    const [, d, m, y] = pick.m
    return `${Number(d)}.${Number(m)}.${y}`
  }
  return undefined
}

/** מפענח את כל העמודים של ה-PDF לטיוטת מערכת */
export function parsePages(pages: RawPage[]): DraftSchedule {
  seq = 0
  const warnings: string[] = []
  const tables = pages.map((p) => buildTable(p))

  let teachers: Teacher[] = []
  for (const t of tables) {
    if (t && !findTimetable(t)) teachers = teachers.concat(parseTeachers(t))
  }

  const items: DraftItem[] = []
  let found = false
  for (const t of tables) {
    if (!t) continue
    const tt = findTimetable(t)
    if (!tt) continue
    found = true
    items.push(...parseTimetable(t, tt, teachers, warnings))
  }

  if (!found) warnings.push('לא מצאתי בקובץ טבלת מערכת שעות. אולי הקובץ סרוק או בנוי אחרת.')
  else if (!teachers.length) warnings.push('לא מצאתי טבלת מרצים, ולכן לא הושלמו חדרים ושמות מלאים.')

  return { items, warnings, teachers, versionDate: findVersionDate(pages) }
}
