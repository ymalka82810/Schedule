import type { HLine, RawPage, RawWord, VLine } from './raw'

/** תא בטבלה, אחרי איחוד תאים ממוזגים */
export interface Cell {
  /** אינדקסי שורות ועמודות (כולל). שורה 0 למעלה, עמודה 0 משמאל */
  r1: number
  r2: number
  c1: number
  c2: number
  x1: number
  x2: number
  /** y1 תחתון, y2 עליון */
  y1: number
  y2: number
  words: RawWord[]
}

export interface Table {
  xs: number[]
  /** מלמעלה למטה */
  ys: number[]
  rows: number
  cols: number
  cells: Cell[]
}

const TOL = 1.6

/** מקבץ ערכים קרובים לערך אחד */
function cluster(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b)
  const out: number[] = []
  let group: number[] = []
  for (const v of sorted) {
    if (group.length && v - group[group.length - 1] > TOL) {
      out.push(group.reduce((s, n) => s + n, 0) / group.length)
      group = []
    }
    group.push(v)
  }
  if (group.length) out.push(group.reduce((s, n) => s + n, 0) / group.length)
  return out
}

/** האם הקטעים מכסים את רוב האורך [a, b] */
function covered(intervals: Array<[number, number]>, a: number, b: number): boolean {
  const lo = Math.min(a, b) + 1
  const hi = Math.max(a, b) - 1
  if (hi <= lo) return true
  const sorted = intervals.filter(([s, e]) => e > lo && s < hi).sort((p, q) => p[0] - q[0])
  let reach = lo
  for (const [s, e] of sorted) {
    if (s > reach + TOL) return false
    reach = Math.max(reach, e)
    if (reach >= hi - TOL) return true
  }
  return reach >= hi - TOL
}

type Seg = { kind: 'h'; i: number } | { kind: 'v'; i: number }

/** מוצא את קבוצת הקווים המחוברת הגדולה ביותר: הטבלה הראשית בעמוד */
function mainCluster(hLines: HLine[], vLines: VLine[]): { h: HLine[]; v: VLine[] } {
  const n = hLines.length + vLines.length
  const parent = Array.from({ length: n }, (_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b)
  }
  const segs: Seg[] = [
    ...hLines.map((_, i): Seg => ({ kind: 'h', i })),
    ...vLines.map((_, i): Seg => ({ kind: 'v', i })),
  ]
  const hOff = 0
  const vOff = hLines.length

  for (let a = 0; a < hLines.length; a++) {
    for (let b = 0; b < vLines.length; b++) {
      const h = hLines[a]
      const v = vLines[b]
      if (
        v.x >= h.x1 - TOL &&
        v.x <= h.x2 + TOL &&
        h.y >= v.y1 - TOL &&
        h.y <= v.y2 + TOL
      ) {
        union(hOff + a, vOff + b)
      }
    }
  }

  const sizes = new Map<number, number>()
  segs.forEach((s, idx) => {
    const len = s.kind === 'h' ? hLines[s.i].x2 - hLines[s.i].x1 : vLines[s.i].y2 - vLines[s.i].y1
    const root = find(idx)
    sizes.set(root, (sizes.get(root) ?? 0) + len)
  })
  let best = -1
  let bestSize = 0
  for (const [root, size] of sizes) {
    if (size > bestSize) {
      best = root
      bestSize = size
    }
  }
  return {
    h: hLines.filter((_, i) => find(hOff + i) === best),
    v: vLines.filter((_, i) => find(vOff + i) === best),
  }
}

/** בונה טבלה מהקווים בעמוד. מחזיר null אם אין שם טבלה */
export function buildTable(page: RawPage): Table | null {
  const { h, v } = mainCluster(page.hLines, page.vLines)
  if (h.length < 2 || v.length < 2) return null

  const xs = cluster(v.map((l) => l.x))
  // y מלמעלה למטה
  const ys = cluster(h.map((l) => l.y)).sort((a, b) => b - a)
  const cols = xs.length - 1
  const rows = ys.length - 1
  if (cols < 1 || rows < 1) return null

  const near = (a: number, b: number) => Math.abs(a - b) <= TOL

  // האם יש קו אנכי בקצה x שמכסה את הטווח של שורה r
  const vEdgeCovered = (xi: number, r: number) => {
    const iv = v.filter((l) => near(l.x, xs[xi])).map((l): [number, number] => [l.y1, l.y2])
    return covered(iv, ys[r + 1], ys[r])
  }
  const hEdgeCovered = (yi: number, c: number) => {
    const iv = h.filter((l) => near(l.y, ys[yi])).map((l): [number, number] => [l.x1, l.x2])
    return covered(iv, xs[c], xs[c + 1])
  }

  const parent = Array.from({ length: rows * cols }, (_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b)
  }
  const id = (r: number, c: number) => r * cols + c

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c + 1 < cols && !vEdgeCovered(c + 1, r)) union(id(r, c), id(r, c + 1))
      if (r + 1 < rows && !hEdgeCovered(r + 1, c)) union(id(r, c), id(r + 1, c))
    }
  }

  const groups = new Map<number, Cell>()
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const root = find(id(r, c))
      const g = groups.get(root)
      if (!g) {
        groups.set(root, {
          r1: r,
          r2: r,
          c1: c,
          c2: c,
          x1: xs[c],
          x2: xs[c + 1],
          y1: ys[r + 1],
          y2: ys[r],
          words: [],
        })
      } else {
        g.r1 = Math.min(g.r1, r)
        g.r2 = Math.max(g.r2, r)
        g.c1 = Math.min(g.c1, c)
        g.c2 = Math.max(g.c2, c)
        g.x1 = Math.min(g.x1, xs[c])
        g.x2 = Math.max(g.x2, xs[c + 1])
        g.y1 = Math.min(g.y1, ys[r + 1])
        g.y2 = Math.max(g.y2, ys[r])
      }
    }
  }

  const cells = [...groups.values()]
  for (const w of page.words) {
    const cx = w.x + w.w / 2
    const cy = w.y + w.h / 2
    const hit = cells.find((cell) => cx >= cell.x1 && cx < cell.x2 && cy >= cell.y1 && cy < cell.y2)
    if (hit) hit.words.push(w)
  }

  return { xs, ys, rows, cols, cells }
}
