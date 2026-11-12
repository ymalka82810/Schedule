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

export function parseTeachers(table: Table): Teacher[] {
  const out: Teacher[] = []
  const byRow = new Map<number, Cell[]>()
  for (const cell of table.cells) {
    if (cell.r1 !== cell.r2 || !cell.words.length) continue
    byRow.set(cell.r1, [...(byRow.get(cell.r1) ?? []), cell])
  }
  for (const cells of byRow.values()) {
    // מימין לשמאל: מרצה | מקצוע | כיתה
    const ordered = [...cells].sort((a, b) => b.c1 - a.c1).map(cellText)
    if (ordered.length < 3) continue
    const [fullName, subjectRaw, room] = ordered
    if (!/\d/.test(room)) continue
    const subject = normalizeSubject(subjectRaw.split(/\d|[-–]/)[0])
    if (!fullName || !subject) continue
    out.push({ fullName, subject, room })
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

const optionKey = (o: DraftOption) => `${o.name}|${o.teacher ?? ''}|${o.group ?? ''}|${o.room ?? ''}`
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
    const check = blocks.length > 1

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

  return { items, warnings }
}
