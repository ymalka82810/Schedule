import type { HLine, RawPage, RawWord, VLine } from './raw'

/**
 * קריאה של מערכת סרוקה או מצולמת: אין שכבת טקסט ואין קווים מצוירים, רק פיקסלים.
 * המטרה היא לבנות את אותו ייצוג גולמי (מילים עם מיקום + קווי הטבלה) שמגיע מ-PDF רגיל,
 * כדי שכל שאר הקורא (זיהוי הטבלה, התאים הממוזגים, הפענוח והאשף) יעבוד בלי שינוי.
 * הקווים מזוהים מהתמונה עצמה, והמילים מגיעות מ-tesseract.js עם עברית.
 */

/** תמונה בגווני אפור או צבע, כמו ImageData של הדפדפן */
export interface Bitmap {
  width: number
  height: number
  /** RGBA, 4 בתים לפיקסל */
  data: Uint8ClampedArray | Uint8Array
}

/** קטע קו בפיקסלים, y כלפי מטה */
export interface PixelLine {
  /** המיקום לאורך הציר הקבוע (y לקו אופקי, x לקו אנכי) */
  at: number
  from: number
  to: number
  /** עובי בפיקסלים */
  thick: number
}

const DARK = 150

const darkMask = (img: Bitmap): Uint8Array => {
  const out = new Uint8Array(img.width * img.height)
  const d = img.data
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    // בהירות לפי משקלי העין. פיקסל שקוף נחשב לבן
    const lum = d[p + 3] < 128 ? 255 : 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]
    out[i] = lum < DARK ? 1 : 0
  }
  return out
}

/**
 * מוצא קווים ארוכים בכיוון אחד. רצף של פיקסלים כהים ארוך מספיק הוא קו, גם אם יש בו
 * חורים קטנים (סריקה לא נקייה). רצפים בשורות סמוכות שחופפים מתאחדים לקו אחד עבה.
 * אות או מילה לא יוצרות רצף ארוך כזה, ולכן הטקסט לא נכנס.
 */
function scan(mask: Uint8Array, w: number, h: number, horizontal: boolean, minLen: number): PixelLine[] {
  const lines: PixelLine[] = []
  const open: PixelLine[] = []
  const outer = horizontal ? h : w
  const inner = horizontal ? w : h
  const GAP = 3
  for (let a = 0; a < outer; a++) {
    const runs: Array<[number, number]> = []
    let start = -1
    let lastDark = -GAP - 1
    for (let b = 0; b < inner; b++) {
      const v = horizontal ? mask[a * w + b] : mask[b * w + a]
      if (v) {
        if (start < 0 || b - lastDark > GAP + 1) {
          if (start >= 0 && lastDark - start + 1 >= minLen) runs.push([start, lastDark])
          start = b
        }
        lastDark = b
      }
    }
    if (start >= 0 && lastDark - start + 1 >= minLen) runs.push([start, lastDark])

    // המשך של קו מהשורה הקודמת, או קו חדש
    const still: PixelLine[] = []
    for (const [s, e] of runs) {
      const prev = open.find((l) => l.at + l.thick === a && Math.min(l.to, e) - Math.max(l.from, s) > (e - s) / 2)
      if (prev) {
        prev.thick++
        prev.from = Math.min(prev.from, s)
        prev.to = Math.max(prev.to, e)
        still.push(prev)
      } else {
        const line = { at: a, from: s, to: e, thick: 1 }
        lines.push(line)
        still.push(line)
      }
    }
    open.length = 0
    open.push(...still)
  }
  const at = (a: number, b: number) =>
    a < 0 || a >= outer ? 0 : horizontal ? mask[a * w + b] : mask[b * w + a]
  /** כמה מהאורך כהה בשורה שליד הקו */
  const besideDark = (row: number, l: PixelLine) => {
    let n = 0
    for (let b = l.from; b <= l.to; b++) n += at(row, b)
    return n / (l.to - l.from + 1)
  }
  return (
    lines
      // קו עבה מדי הוא בעצם שטח צבוע (כותרת עם רקע), לא קו של טבלה
      .filter((l) => l.thick <= Math.max(8, Math.round(outer / 250)))
      // קו של טבלה עומד לבד: מעליו ומתחתיו (או משני צדדיו) כמעט לבן.
      // הפס העליון של אותיות כמו ה, ד, כ נראה כמו קו, אבל צמודים אליו גבעולי האותיות
      .filter((l) => {
        const before = Math.max(besideDark(l.at - 3, l), besideDark(l.at - 5, l))
        const after = Math.max(besideDark(l.at + l.thick + 2, l), besideDark(l.at + l.thick + 4, l))
        return before < 0.25 && after < 0.25
      })
      .map((l) => ({ ...l, at: l.at + (l.thick - 1) / 2 }))
  )
}

export function detectLines(img: Bitmap): { h: PixelLine[]; v: PixelLine[] } {
  const mask = darkMask(img)
  const minLen = Math.max(24, Math.round(Math.min(img.width, img.height) * 0.02))
  return {
    h: scan(mask, img.width, img.height, true, minLen),
    v: scan(mask, img.width, img.height, false, minLen),
  }
}

/** מילה מה-OCR, בפיקסלים, y כלפי מטה */
export interface OcrWord {
  text: string
  x0: number
  y0: number
  x1: number
  y1: number
  confidence?: number
}

/**
 * ממיר לייצוג הגולמי של הקורא: נקודות, y כלפי מעלה, כמו עמוד PDF.
 * scale = כמה פיקסלים לנקודה, כדי שהסבולות של זיהוי הטבלה יתאימו גם לסריקה.
 */
export function toRawPage(img: { width: number; height: number }, lines: { h: PixelLine[]; v: PixelLine[] }, words: OcrWord[], scale: number): RawPage {
  const H = img.height
  const hLines: HLine[] = lines.h.map((l) => ({ y: (H - l.at) / scale, x1: l.from / scale, x2: (l.to + 1) / scale }))
  const vLines: VLine[] = lines.v.map((l) => ({ x: l.at / scale, y1: (H - l.to - 1) / scale, y2: (H - l.from) / scale }))
  const raw: RawWord[] = words
    .filter((w) => w.text.trim())
    .map((w) => ({
      text: w.text.trim(),
      x: w.x0 / scale,
      y: (H - w.y1) / scale,
      w: (w.x1 - w.x0) / scale,
      h: (w.y1 - w.y0) / scale,
      font: 'ocr',
      ...(w.confidence !== undefined && w.confidence < 75 ? { doubt: true } : {}),
    }))
  return { width: img.width / scale, height: H / scale, words: raw, hLines, vLines }
}

/** קנה מידה לתמונה בלי מידות ידועות: מתייחסים אליה כעמוד A4 */
export const imageScale = (img: { width: number; height: number }) =>
  img.width / (img.width > img.height ? 842 : 595)

/** מוחק את קווי הטבלה מהתמונה לפני ה-OCR: קווים צמודים לאותיות מבלבלים את הזיהוי */
export function eraseLines(img: Bitmap, lines: { h: PixelLine[]; v: PixelLine[] }): void {
  const paint = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) return
    const p = (y * img.width + x) * 4
    img.data[p] = img.data[p + 1] = img.data[p + 2] = 255
  }
  for (const l of lines.h) {
    const top = Math.floor(l.at - l.thick / 2) - 1
    for (let y = top; y <= top + l.thick + 2; y++) for (let x = l.from; x <= l.to; x++) paint(x, y)
  }
  for (const l of lines.v) {
    const left = Math.floor(l.at - l.thick / 2) - 1
    for (let x = left; x <= left + l.thick + 2; x++) for (let y = l.from; y <= l.to; y++) paint(x, y)
  }
}

export type OcrProgress = (message: string, fraction?: number) => void

/** אזור בתמונה, בפיקסלים */
export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

/**
 * מזהה טקסט בתמונה כולה (rect = null) או באזור אחד.
 * sparse = קטעים מפוזרים בעמוד, block = טקסט של תא (כמה שורות), word = מילה אחת קצרה
 */
export type OcrMode = 'sparse' | 'block' | 'word'
export type Recognize = (rect: Rect | null, mode: OcrMode) => Promise<OcrWord[]>

const HEBREW = /[\u05d0-\u05ea]/

/** PSM של tesseract לכל מצב */
export const PSM_OF: Record<OcrMode, string> = { sparse: '11', block: '6', word: '8' }

/** שורה של מילים מה-OCR. כל המילים בשורה מקבלות אותו קו בסיס, כדי שסדר הקריאה בתא יישמר */
export interface OcrLine {
  bbox: { x0: number; y0: number; x1: number; y1: number }
  words: Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }>
}

export function wordsOfLines(lines: OcrLine[], minConfidence = 25): OcrWord[] {
  const out: OcrWord[] = []
  for (const l of lines) {
    for (const w of l.words) {
      // מילה עם ביטחון נמוך מאוד היא בדרך כלל לכלוך בסריקה
      if (w.confidence < minConfidence || !w.text.trim()) continue
      out.push({ text: w.text, x0: w.bbox.x0, x1: w.bbox.x1, y0: l.bbox.y0, y1: l.bbox.y1, confidence: w.confidence })
    }
  }
  return out
}

/**
 * קורא עמוד מתמונה: מזהה את קווי הטבלה, מוחק אותם, ואז מזהה טקסט בשני מעברים:
 * מעבר על כל העמוד (כותרות, תאריך הגרסה), ומעבר על כל תא בטבלה לבד. בתא בודד
 * הזיהוי מדויק הרבה יותר, במיוחד באותיות בודדות כמו שמות הימים (א׳, ב׳).
 * img משתנה במקום (הקווים נמחקים); prepare מקבל אותו אחרי המחיקה ומחזיר את פונקציית הזיהוי.
 */
export async function ocrImage(
  img: Bitmap,
  scale: number,
  prepare: (erased: Bitmap) => Promise<Recognize> | Recognize,
  onProgress?: OcrProgress,
): Promise<RawPage> {
  const lines = detectLines(img)
  eraseLines(img, lines)
  const recognize = await prepare(img)
  const { buildTable } = await import('./grid')
  const table = buildTable(toRawPage(img, lines, [], scale))

  onProgress?.('מזהה את הטקסט בעמוד', 0)
  const page = await recognize(null, 'sparse')
  if (!table) return toRawPage(img, lines, page, scale)

  // מילים מהמעבר הכללי נשארות רק מחוץ לטבלה. בתוכה, מה שנקרא בכל תא לבד
  const H = img.height
  const left = table.xs[0] * scale
  const right = table.xs[table.xs.length - 1] * scale
  const top = H - table.ys[0] * scale
  const bottom = H - table.ys[table.ys.length - 1] * scale
  const words = page.filter((w) => {
    const cx = (w.x0 + w.x1) / 2
    const cy = (w.y0 + w.y1) / 2
    return cx < left || cx > right || cy < top || cy > bottom
  })
  const pad = 2
  for (let i = 0; i < table.cells.length; i++) {
    const c = table.cells[i]
    const rect = {
      left: Math.max(0, Math.round(c.x1 * scale) + pad),
      top: Math.max(0, Math.round(H - c.y2 * scale) + pad),
      width: Math.round((c.x2 - c.x1) * scale) - 2 * pad,
      height: Math.round((c.y2 - c.y1) * scale) - 2 * pad,
    }
    onProgress?.('מזהה את הטקסט בכל תא בטבלה', i / table.cells.length)
    if (rect.width < 8 || rect.height < 8) continue
    // תא ריק לגמרי לא שווה זיהוי
    if (!hasInk(img, rect)) continue
    let found = await recognize(rect, 'block')
    // תא קטן בלי אותיות עבריות (למשל "ה'" שנקרא "a"): ניסיון נוסף כמילה אחת
    if (!found.some((w) => HEBREW.test(w.text)) && rect.height < 40 * scale) {
      const again = await recognize(rect, 'word')
      if (again.some((w) => HEBREW.test(w.text))) found = again
    }
    words.push(...found)
  }
  return toRawPage(img, lines, words, scale)
}

/** האם יש באזור פיקסלים כהים (אחרי מחיקת הקווים) */
function hasInk(img: Bitmap, r: Rect): boolean {
  let n = 0
  for (let y = r.top; y < r.top + r.height; y += 2) {
    for (let x = r.left; x < r.left + r.width; x += 2) {
      const p = (y * img.width + x) * 4
      if (0.299 * img.data[p] + 0.587 * img.data[p + 1] + 0.114 * img.data[p + 2] < DARK && ++n > 3) return true
    }
  }
  return false
}

/** אזור מהתמונה כקנבס נפרד, עם שוליים לבנים: tesseract מזהה טוב יותר טקסט שלא צמוד לקצה */
export const CROP_MARGIN = 10

/** תא נמוך (שורה אחת, אות בודדת) מוגדל פי 2: tesseract מפספס אותיות קטנות */
export const cropZoom = (r: Rect) => (r.height < 120 ? 2 : 1)

function crop(canvas: HTMLCanvasElement, r: Rect): HTMLCanvasElement {
  const margin = CROP_MARGIN
  const z = cropZoom(r)
  const out = document.createElement('canvas')
  out.width = r.width * z + 2 * margin
  out.height = r.height * z + 2 * margin
  const ctx = out.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.drawImage(canvas, r.left, r.top, r.width, r.height, margin, margin, r.width * z, r.height * z)
  return out
}

/**
 * מזהה טקסט בתמונה עם tesseract.js (עברית ואנגלית). הספרייה ונתוני השפה (כמה MB)
 * נטענים רק כשצריך, בפעם הראשונה שמייבאים קובץ סרוק, ואחר כך נשמרים בדפדפן.
 */
export async function ocrCanvas(canvas: HTMLCanvasElement, scale: number, onProgress?: OcrProgress): Promise<RawPage> {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  onProgress?.('טוען את זיהוי הטקסט בעברית (בפעם הראשונה זה לוקח כמה שניות)')
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker(['heb', 'eng'])
  try {
    return await ocrImage(
      img,
      scale,
      (erased) => {
        ctx.putImageData(erased as ImageData, 0, 0)
        return async (rect, mode) => {
          await worker.setParameters({
            tessedit_pageseg_mode: PSM_OF[mode] as never,
            preserve_interword_spaces: '1',
          })
          // תא נשלח כתמונה קטנה משלו: שליחת כל העמוד לכל תא איטית מאוד בדפדפן
          const source = rect ? crop(canvas, rect) : canvas
          const { data } = await worker.recognize(source, {}, { blocks: true })
          const words = wordsOfLines((data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines)))
          if (!rect) return words
          // המיקומים חוזרים יחסית לקנבס הקטן, כולל השוליים וההגדלה
          const z = cropZoom(rect)
          const back = (v: number, o: number) => (v - CROP_MARGIN) / z + o
          return words.map((w) => ({
            ...w,
            x0: back(w.x0, rect.left),
            x1: back(w.x1, rect.left),
            y0: back(w.y0, rect.top),
            y1: back(w.y1, rect.top),
          }))
        }
      },
      onProgress,
    )
  } finally {
    await worker.terminate()
  }
}
