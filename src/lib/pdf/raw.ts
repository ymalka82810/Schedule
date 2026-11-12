/**
 * הייצוג הגולמי של עמוד PDF: מילים עם מיקום, וקווים שמרכיבים את הטבלה.
 * כל הקואורדינטות במרחב של העמוד (y עולה כלפי מעלה), ביחידות נקודה.
 */

export interface RawWord {
  text: string
  /** הקצה השמאלי של המילה */
  x: number
  /** קו הבסיס */
  y: number
  w: number
  h: number
  /** מזהה הגופן. גופנים שונים באותו תא (רגיל מול מודגש) מפרידים בין קטעים */
  font: string
}

export interface HLine {
  y: number
  x1: number
  x2: number
}

export interface VLine {
  x: number
  y1: number
  y2: number
}

export interface RawPage {
  width: number
  height: number
  words: RawWord[]
  hLines: HLine[]
  vLines: VLine[]
}

// ---- המרה מ-pdf.js (מבנים מינימליים, כדי שהקוד הזה יעבוד גם בדפדפן וגם בבדיקות ב-Node) ----

export interface PdfTextItem {
  str: string
  transform: number[]
  width: number
  height: number
  fontName: string
}

export interface PdfPageLike {
  getTextContent(): Promise<{ items: unknown[] }>
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[] }>
  view: number[]
}

/** קודי הפעולות של pdf.js שאנחנו צריכים. נשלחים מבחוץ כי הם מגיעים מהספרייה */
export interface PdfOps {
  save: number
  restore: number
  transform: number
  constructPath: number
  paintFormXObjectBegin: number
  paintFormXObjectEnd: number
  stroke: number
  closeStroke: number
  fill: number
  eoFill: number
  fillStroke: number
  eoFillStroke: number
  closeFillStroke: number
  closeEOFillStroke: number
}

type Matrix = [number, number, number, number, number, number]

/** מכפלה: מפעיל קודם את n ואחר כך את m */
const mul = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
]

// פקודות בתוך נתוני נתיב של pdf.js: moveTo, lineTo, curveTo, quadraticCurveTo, closePath
const MOVE = 0
const LINE = 1
const CURVE = 2
const QUAD = 3
const CLOSE = 4

const clean = (s: string) => s.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')

export async function pageToRaw(page: PdfPageLike, ops: PdfOps): Promise<RawPage> {
  const [x0, y0, x1, y1] = page.view
  const text = await page.getTextContent()

  const words: RawWord[] = []
  for (const raw of text.items) {
    const it = raw as Partial<PdfTextItem>
    if (typeof it.str !== 'string' || !it.transform) continue
    const str = clean(it.str).trim()
    if (!str) continue
    words.push({
      text: str,
      x: it.transform[4],
      y: it.transform[5],
      w: it.width ?? 0,
      h: it.height ?? Math.abs(it.transform[3]),
      font: it.fontName ?? '',
    })
  }

  const list = await page.getOperatorList()
  const paints = new Set([
    ops.stroke,
    ops.closeStroke,
    ops.fill,
    ops.eoFill,
    ops.fillStroke,
    ops.eoFillStroke,
    ops.closeFillStroke,
    ops.closeEOFillStroke,
  ])
  const fillOnly = new Set([ops.fill, ops.eoFill])

  const hLines: HLine[] = []
  const vLines: VLine[] = []
  let ctm: Matrix = [1, 0, 0, 1, 0, 0]
  const stack: Matrix[] = []

  // מלבן דק שמצויר כמילוי הוא בפועל קו
  const addThinRect = (xa: number, ya: number, xb: number, yb: number) => {
    const w = Math.abs(xb - xa)
    const h = Math.abs(yb - ya)
    if (h <= 1.5 && w > 4) hLines.push({ y: (ya + yb) / 2, x1: Math.min(xa, xb), x2: Math.max(xa, xb) })
    else if (w <= 1.5 && h > 4) vLines.push({ x: (xa + xb) / 2, y1: Math.min(ya, yb), y2: Math.max(ya, yb) })
  }

  const addSegment = (ax: number, ay: number, bx: number, by: number) => {
    if (Math.abs(ay - by) < 0.6 && Math.abs(ax - bx) > 4) {
      hLines.push({ y: (ay + by) / 2, x1: Math.min(ax, bx), x2: Math.max(ax, bx) })
    } else if (Math.abs(ax - bx) < 0.6 && Math.abs(ay - by) > 4) {
      vLines.push({ x: (ax + bx) / 2, y1: Math.min(ay, by), y2: Math.max(ay, by) })
    }
  }

  for (let i = 0; i < list.fnArray.length; i++) {
    const fn = list.fnArray[i]
    const args = list.argsArray[i]

    if (fn === ops.save) {
      stack.push(ctm)
    } else if (fn === ops.restore) {
      ctm = stack.pop() ?? ctm
    } else if (fn === ops.transform) {
      ctm = mul(ctm, args as Matrix)
    } else if (fn === ops.paintFormXObjectBegin) {
      stack.push(ctm)
      const m = (args as unknown[] | null)?.[0]
      if (Array.isArray(m) && m.length === 6) ctm = mul(ctm, m as Matrix)
    } else if (fn === ops.paintFormXObjectEnd) {
      ctm = stack.pop() ?? ctm
    } else if (fn === ops.constructPath) {
      const [paint, parts] = args as [number, ArrayLike<number>[]]
      if (!paints.has(paint)) continue
      const d = parts?.[0]
      if (!d) continue

      const pts: Array<[number, number]> = []
      const subPaths: Array<Array<[number, number]>> = []
      let k = 0
      while (k < d.length) {
        const c = d[k]
        if (c === MOVE || c === LINE) {
          const x = d[k + 1]
          const y = d[k + 2]
          const p: [number, number] = [
            ctm[0] * x + ctm[2] * y + ctm[4],
            ctm[1] * x + ctm[3] * y + ctm[5],
          ]
          if (c === MOVE && pts.length) subPaths.push(pts.splice(0))
          pts.push(p)
          k += 3
        } else if (c === CURVE) k += 7
        else if (c === QUAD) k += 5
        else if (c === CLOSE) k += 1
        else k += 1
      }
      if (pts.length) subPaths.push(pts)

      for (const sp of subPaths) {
        const isRect = sp.length >= 4 && sp.length <= 5
        if (fillOnly.has(paint) && isRect) {
          const xs = sp.map((p) => p[0])
          const ys = sp.map((p) => p[1])
          addThinRect(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys))
        } else if (!fillOnly.has(paint)) {
          for (let j = 1; j < sp.length; j++) addSegment(sp[j - 1][0], sp[j - 1][1], sp[j][0], sp[j][1])
          // סגירת מצולע (מלבן שמצויר כקווי מתאר)
          if (sp.length >= 4) addSegment(sp[sp.length - 1][0], sp[sp.length - 1][1], sp[0][0], sp[0][1])
        }
      }
    }
  }

  return { width: x1 - x0, height: y1 - y0, words, hLines, vLines }
}
