import type { DayIndex, Minutes } from '../../types'
import type { DraftItem, DraftOption, DraftSchedule } from './draft'
import { buildTable, type Cell, type Table } from './grid'
import {
  COURSE_CODE,
  KNOWN_WORDS,
  lineCount,
  detectKind,
  kindOf,
  normalizeSubject,
  parseBlockText,
  parseLines,
  readingOrder,
  splitBlocks,
  type ParsedOption,
  type Teacher,
} from './parseCell'
import type { RawPage, RawWord } from './raw'

const DAY_LETTERS: Record<string, DayIndex> = { א: 0, ב: 1, ג: 2, ד: 3, ה: 4, ו: 5 }
const DAY_WORDS: Record<string, DayIndex> = { ראשון: 0, שני: 1, שלישי: 2, רביעי: 3, חמישי: 4, שישי: 5 }
const DAY_EN: Array<[RegExp, DayIndex]> = [
  [/^sun(day)?$/, 0],
  [/^mon(day)?$/, 1],
  [/^tue(s|sday)?$/, 2],
  [/^wed(nesday)?$/, 3],
  [/^thu(r|rs|rsday)?$/, 4],
  [/^fri(day)?$/, 5],
]
/** טווח שעות: "08:00-08:45", "8:30 – 9:15", "12.30-14.30" */
const TIME_RANGE = /(\d{1,2})[:.](\d{2})\s*[-\u2013\u2014\u05be]\s*(\d{1,2})[:.](\d{2})/
const ONE_TIME = /^\D*?(\d{1,2})[:.](\d{2})\D*$/

/** שם יום בכותרת: "א'", "ראשון", "יום ראשון", "ראשון 12.4", "Sunday", "Mon" */
export function dayOf(text: string): DayIndex | undefined {
  const t = text
    .replace(/[\u200e\u200f]/g, '')
    .replace(/\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?/g, ' ')
    .replace(/(^|\s)יום(?=\s|$)/g, ' ')
  const tokens = t.split(/[^\u05d0-\u05eaA-Za-z]+/).filter(Boolean)
  if (tokens.length !== 1) return undefined
  const w = tokens[0]
  if (w in DAY_LETTERS) return DAY_LETTERS[w]
  if (w in DAY_WORDS) return DAY_WORDS[w]
  const lower = w.toLowerCase()
  return DAY_EN.find(([re]) => re.test(lower))?.[1]
}

/** טווח שעות בטקסט. אם השעות יצאו הפוכות (סדר מילים הפוך), מתקנים */
function timeRange(text: string): { start: Minutes; end: Minutes } | undefined {
  const m = TIME_RANGE.exec(text)
  if (!m) return undefined
  const a = toMin(m[1], m[2])
  const b = toMin(m[3], m[4])
  if (a === b) return undefined
  return { start: Math.min(a, b), end: Math.max(a, b) }
}

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
    .map((l) => readingOrder(l).map((w) => w.text).join(' '))
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

/**
 * הטבלה בכיוון אחר: ימים בשורות ושעות בעמודות (הדפסה לרוחב). מסובבים את האינדקסים
 * כך שהקוד שמחפש ימים בשורה העליונה ושעות בעמודה יעבוד בלי שינוי. המילים ומיקומן לא משתנים.
 */
function transpose(table: Table, mirror: boolean): Table {
  const flip = (c: number) => (mirror ? table.cols - 1 - c : c)
  return {
    ...table,
    rows: table.cols,
    cols: table.rows,
    cells: table.cells.map((c) => ({
      ...c,
      r1: Math.min(flip(c.c1), flip(c.c2)),
      r2: Math.max(flip(c.c1), flip(c.c2)),
      c1: c.r1,
      c2: c.r2,
    })),
  }
}

function findTimetableIn(table: Table): Timetable | null {
  // שורת הימים: השורה עם הכי הרבה תאים שהם שם של יום
  let headerRow = -1
  let best = 0
  let dayOfCol = new Map<number, DayIndex>()
  for (let r = 0; r < Math.min(table.rows, 3); r++) {
    const map = new Map<number, DayIndex>()
    for (const cell of table.cells) {
      if (cell.r1 !== r || cell.c1 !== cell.c2) continue
      const d = dayOf(cellText(cell))
      if (d !== undefined) map.set(cell.c1, d)
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
  const singles = new Map<number, number>()
  for (const cell of table.cells) {
    if (cell.r1 <= headerRow || cell.c1 !== cell.c2 || dayOfCol.has(cell.c1)) continue
    const text = cellText(cell)
    if (timeRange(text)) counts.set(cell.c1, (counts.get(cell.c1) ?? 0) + 1)
    else if (ONE_TIME.test(text)) singles.set(cell.c1, (singles.get(cell.c1) ?? 0) + 1)
  }
  const top = (m: Map<number, number>) => [...m].sort((a, b) => b[1] - a[1])[0]
  const rowTimes = new Map<number, { start: Minutes; end: Minutes }>()
  const ranged = top(counts)
  if (ranged && ranged[1] >= 2) {
    const timeCol = ranged[0]
    for (const cell of table.cells) {
      if (cell.c1 > timeCol || cell.c2 < timeCol) continue
      const t = timeRange(cellText(cell))
      if (!t) continue
      for (let r = cell.r1; r <= cell.r2; r++) rowTimes.set(r, t)
    }
    return { dayOfCol, timeCol, headerRow, rowTimes }
  }

  // שעה אחת בכל שורה ("08:00", "09:00"): השורה נגמרת כשהבאה מתחילה
  const single = top(singles)
  if (!single || single[1] < 3) return null
  const timeCol = single[0]
  const starts: Array<{ r1: number; r2: number; start: Minutes }> = []
  for (const cell of table.cells) {
    if (cell.c1 !== timeCol || cell.r1 <= headerRow) continue
    const m = ONE_TIME.exec(cellText(cell))
    if (m) starts.push({ r1: cell.r1, r2: cell.r2, start: toMin(m[1], m[2]) })
  }
  starts.sort((a, b) => a.r1 - b.r1)
  const steps = starts.slice(1).map((s, i) => s.start - starts[i].start).filter((d) => d > 0)
  const step = steps.length ? steps.sort((a, b) => a - b)[Math.floor(steps.length / 2)] : 60
  starts.forEach((s, i) => {
    const end = i + 1 < starts.length && starts[i + 1].start > s.start ? starts[i + 1].start : s.start + step
    const span = s.r2 - s.r1 + 1
    for (let r = s.r1; r <= s.r2; r++) {
      const a = s.start + Math.round(((end - s.start) * (r - s.r1)) / span)
      const b = s.start + Math.round(((end - s.start) * (r - s.r1 + 1)) / span)
      rowTimes.set(r, { start: a, end: b })
    }
  })
  return { dayOfCol, timeCol, headerRow, rowTimes }
}

/** מוצא את מערכת השעות בטבלה: ימים בעמודות (הרגיל) או ימים בשורות */
function findTimetable(table: Table): { table: Table; tt: Timetable } | null {
  const options = [table, transpose(table, true), transpose(table, false)]
  let best: { table: Table; tt: Timetable } | null = null
  for (const t of options) {
    const tt = findTimetableIn(t)
    if (tt && (!best || tt.dayOfCol.size > best.tt.dayOfCol.size)) best = { table: t, tt }
  }
  return best
}

const optionKey = (o: DraftOption) => `${o.name}|${o.teacher ?? ''}|${o.group ?? ''}|${o.room ?? ''}|${o.kind ?? ''}`
const signature = (opts: DraftOption[]) => opts.map(optionKey).sort().join('#')

let seq = 0
const nextId = () => `d${++seq}`

function parseTimetable(table: Table, tt: Timetable, teachers: Teacher[], warnings: string[]): DraftItem[] {
  const pieces: DraftItem[] = []

  // מספר השורות הנפוץ בתא, ומילון המילים בטבלה: לזיהוי שורות ומילים שנשברו בגלל רוחב
  const dayCells = table.cells.filter((c) => tt.dayOfCol.has(c.c1) && c.c1 === c.c2 && c.r1 > tt.headerRow && c.words.length)
  const freq = new Map<number, number>()
  for (const c of dayCells) {
    const n = lineCount(c.words)
    freq.set(n, (freq.get(n) ?? 0) + 1)
  }
  const typicalLines = [...freq].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0]
  const vocab = new Set(KNOWN_WORDS)
  for (const c of table.cells) for (const w of c.words) vocab.add(w.text.replace(/[^\u05d0-\u05ea]/g, ''))

  for (const cell of table.cells) {
    const day = tt.dayOfCol.get(cell.c1)
    if (day === undefined || cell.c1 !== cell.c2) continue
    if (cell.r1 <= tt.headerRow || !cell.words.length) continue

    const blocks = splitBlocks(cell.words, { box: cell, typicalLines, vocab })
    // בלי טבלת מרצים, תא שבנוי בשורות (מקצוע / מורה / חדר) נקרא שורה-שורה
    const parsed: ParsedOption[] = blocks.flatMap((b) =>
      !teachers.length && b.lines.length > 1 && !b.text.includes('/')
        ? parseLines(b.lines, teachers)
        : parseBlockText(b.text, teachers),
    )
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
          options: active.map(({ name, teacher, group, room, kind }) => ({
            name,
            teacher,
            group,
            room,
            ...(kind ? { kind } : {}),
          })),
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

// ---------- רשימת קורסים ----------

const LIST_HEAD = {
  day: /^(?:יום|ימים|day)$/i,
  time: /^(?:שעות|שעה|שעות הוראה|time|hours)$/i,
  dayTime: /יום\s*ו?שעת?|מועד|day\s*(?:&|and)\s*time/i,
  name: /קורס|מקצוע|שם\s*ה?קורס|course|subject/i,
  teacher: /^(?:מרצה|מרצים|מורה|שם המרצה|teacher|lecturer|instructor)$/i,
  room: /^(?:חדר|כיתה|מיקום|room|location)$/i,
  kind: /אופן|סוג|type/i,
}

const RANGE_SRC = "\\d{1,2}[:.]\\d{2}\\s*[-\\u2013\\u2014]\\s*\\d{1,2}[:.]\\d{2}"
const DAY_THEN_TIME = new RegExp(`(?<![\\u05d0-\\u05ea])([א-ו])['\\u05f3\\u2019]?\\s*,?\\s*(${RANGE_SRC})`, 'g')
const TIME_THEN_DAY = new RegExp(`(${RANGE_SRC})\\s*,?\\s*([א-ו])['\\u05f3\\u2019]?(?![\\u05d0-\\u05ea])`, 'g')

/** כל המועדים בתא: "ג' 12:30-14:30", "12:30-14:30 ,ג'", וכמה מועדים באותו תא */
function dayTimes(text: string): Array<{ day: DayIndex; start: Minutes; end: Minutes }> {
  const out: Array<{ day: DayIndex; start: Minutes; end: Minutes }> = []
  const add = (letter: string, range: string) => {
    const t = timeRange(range)
    if (t && !out.some((o) => o.start === t.start && o.day === DAY_LETTERS[letter])) out.push({ day: DAY_LETTERS[letter], ...t })
  }
  for (const m of text.matchAll(DAY_THEN_TIME)) add(m[1], m[2])
  if (!out.length) for (const m of text.matchAll(TIME_THEN_DAY)) add(m[2], m[1])
  return out
}

/**
 * טבלה שבה כל שורה היא קורס (מכללות, אוניברסיטאות): עמודות "יום" ו"שעות" נפרדות, או תא אחד
 * עם יום ושעה יחד ("ג' 12:30-14:30"). יום ריק בשורה = אותו יום כמו בשורה הקודמת.
 */
function parseList(table: Table, warnings: string[]): DraftItem[] {
  const at = (r: number, c: number) => table.cells.find((x) => x.r1 <= r && r <= x.r2 && x.c1 <= c && c <= x.c2)
  for (let headerRow = 0; headerRow < Math.min(3, table.rows); headerRow++) {
    const cols: Partial<Record<keyof typeof LIST_HEAD, number>> = {}
    const dayTimeCols: Array<{ col: number; kind?: string }> = []
    for (const cell of table.cells) {
      if (cell.r1 !== headerRow) continue
      const text = cellText(cell)
      if (LIST_HEAD.dayTime.test(text)) {
        dayTimeCols.push({ col: cell.c1, kind: /תרגול|תרגיל/.test(text) ? 'תרגול' : /מעבדה/.test(text) ? 'מעבדה' : undefined })
        continue
      }
      for (const key of ['day', 'time', 'name', 'teacher', 'room', 'kind'] as const) {
        if (cols[key] === undefined && LIST_HEAD[key].test(text)) {
          cols[key] = cell.c1
          break
        }
      }
    }
    const separate = cols.day !== undefined && cols.time !== undefined
    if (cols.name === undefined || (!separate && !dayTimeCols.length)) continue

    const items: DraftItem[] = []
    let lastDay: DayIndex | undefined
    for (let r = headerRow + 1; r < table.rows; r++) {
      const text = (c?: number) => {
        const cell = c === undefined ? undefined : at(r, c)
        return cell ? cellText(cell) : ''
      }
      const rawName = text(cols.name)
      if (!rawName) continue
      const kindText = text(cols.kind)
      const { rest, kind: kindInName } = detectKind(rawName.replace(COURSE_CODE, ' '))
      const name = rest.replace(/^[\s\-\u2013,.]+|[\s\-\u2013,.]+$/g, '').replace(/\s+/g, ' ').trim()
      const teacher = text(cols.teacher) || undefined
      const room = text(cols.room) || undefined
      const slots: Array<{ day: DayIndex; start: Minutes; end: Minutes; kind?: string }> = []

      if (separate) {
        const d = text(cols.day)
        const day = d ? (dayOf(d) ?? lastDay) : lastDay
        if (d && dayOf(d) !== undefined) lastDay = dayOf(d)
        const t = timeRange(text(cols.time))
        if (day !== undefined && t) slots.push({ day, ...t, kind: kindOf(kindText) })
      }
      for (const { col, kind } of dayTimeCols) {
        for (const { day, start, end } of dayTimes(text(col))) {
          if (!slots.some((x) => x.day === day && x.start === start)) slots.push({ day, start, end, kind })
        }
      }
      if (!name || !slots.length) continue
      for (const s of slots) {
        const k = s.kind ?? kindInName
        items.push({
          id: nextId(),
          day: s.day,
          start: s.start,
          end: s.end,
          options: [{ name, teacher, room, ...(k ? { kind: k } : {}) }],
          raw: rawName,
        })
      }
    }
    if (items.length >= 2) return items
  }
  if (table.rows > 2) warnings.push('מצאתי טבלה, אבל לא זיהיתי בה ימים ושעות.')
  return []
}

/** מפענח את כל העמודים של ה-PDF לטיוטת מערכת */
export function parsePages(pages: RawPage[]): DraftSchedule {
  seq = 0
  const warnings: string[] = []
  const tables = pages.map((p) => buildTable(p))

  let teachers: Teacher[] = []
  const grids = tables.map((t) => (t ? findTimetable(t) : null))
  tables.forEach((t, i) => {
    if (t && !grids[i]) teachers = teachers.concat(parseTeachers(t))
  })

  const items: DraftItem[] = []
  let found = false
  tables.forEach((t, i) => {
    const g = grids[i]
    if (!t || !g) return
    found = true
    items.push(...parseTimetable(g.table, g.tt, teachers, warnings))
  })
  if (!found) {
    const listWarnings: string[] = []
    for (const t of tables) if (t) items.push(...parseList(t, listWarnings))
    if (items.length) {
      found = true
      teachers = []
    }
  }

  if (!found) warnings.push('לא מצאתי בקובץ טבלת מערכת שעות. אולי הקובץ סרוק או בנוי אחרת.')
  else if (!teachers.length && !items.some((i) => i.options.some((o) => o.teacher)))
    warnings.push('לא מצאתי טבלת מרצים, ולכן לא הושלמו חדרים ושמות מלאים.')

  return { items, warnings, teachers, versionDate: findVersionDate(pages) }
}
