import { pageToRaw, type PdfOps, type PdfPageLike, type RawPage } from './raw'
import { parsePages } from './parseSchedule'
import type { DraftSchedule } from './draft'
import type { OcrProgress } from './ocr'

export interface PdfReadResult {
  draft: DraftSchedule
  /** תמונות של העמודים המקוריים (כתובות blob), להשוואה מול הטיוטה. לשחרר עם URL.revokeObjectURL */
  pages: string[]
}

/** כמה עמודים מציירים לתצוגה. המערכת עצמה בעמוד הראשון, המרצים בשני */
const PREVIEW_PAGES = 2

interface RenderablePage {
  getViewport(o: { scale: number }): { width: number; height: number }
  render(o: { canvas: HTMLCanvasElement; viewport: unknown }): { promise: Promise<void> }
}

async function renderPage(page: RenderablePage): Promise<string | null> {
  const viewport = page.getViewport({ scale: 2 })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  await page.render({ canvas, viewport }).promise
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
  return blob ? URL.createObjectURL(blob) : null
}

/** פחות מילים מזה בעמוד = אין שכבת טקסט, העמוד סרוק */
const SCANNED_BELOW = 5
/** קנה המידה לציור עמוד סרוק לפני זיהוי התווים: מספיק חד לאותיות קטנות */
const OCR_SCALE = 3

const OCR_WARNING =
  'הקובץ נקרא מתמונה, בזיהוי תווים. שיעורים עם מילים שזוהו בביטחון נמוך מסומנים "כדאי לבדוק", אבל כדאי לעבור על כל שיעור מול הקובץ המקורי.'

function withOcrWarning(draft: DraftSchedule): DraftSchedule {
  return { ...draft, warnings: [OCR_WARNING, ...draft.warnings] }
}

/** PDF, או תמונה (צילום או סריקה של המערכת) */
export async function readScheduleFile(file: File, onProgress?: OcrProgress): Promise<PdfReadResult> {
  const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|heic|bmp|gif)$/i.test(file.name)
  return isImage ? readScheduleImage(file, onProgress) : readSchedulePdf(file, onProgress)
}

/** תמונה של המערכת: מגדילים תמונה קטנה, כדי שהאותיות יהיו ברורות מספיק לזיהוי */
async function readScheduleImage(file: File, onProgress?: OcrProgress): Promise<PdfReadResult> {
  const bitmap = await createImageBitmap(file)
  const zoom = Math.min(3, Math.max(1, 2400 / Math.max(bitmap.width, bitmap.height)))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * zoom)
  canvas.height = Math.round(bitmap.height * zoom)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const { ocrCanvas, imageScale } = await import('./ocr')
  const page = await ocrCanvas(canvas, imageScale(canvas), onProgress)
  return { draft: withOcrWarning(parsePages([page])), pages: [URL.createObjectURL(file)] }
}

/**
 * קורא קובץ PDF בדפדפן ומחזיר טיוטת מערכת ותמונות של העמודים.
 * עמוד בלי שכבת טקסט (סרוק) עובר לזיהוי תווים.
 * הספריות נטענות רק כשצריך, כדי שהאתר עצמו יישאר קל.
 */
export async function readSchedulePdf(file: File, onProgress?: OcrProgress): Promise<PdfReadResult> {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default

  const data = new Uint8Array(await file.arrayBuffer())
  const task = pdfjs.getDocument({ data })
  const doc = await task.promise
  try {
    const pages: RawPage[] = []
    const images: string[] = []
    let scanned = false
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      let raw = await pageToRaw(page as unknown as PdfPageLike, pdfjs.OPS as unknown as PdfOps)
      if (raw.words.length < SCANNED_BELOW) {
        scanned = true
        const { ocrCanvas } = await import('./ocr')
        const viewport = page.getViewport({ scale: OCR_SCALE })
        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        await page.render({ canvas, viewport }).promise
        const report: OcrProgress | undefined = onProgress
          ? (m, f) => onProgress(doc.numPages > 1 ? `עמוד ${i} מתוך ${doc.numPages}: ${m}` : m, f)
          : undefined
        raw = await ocrCanvas(canvas, OCR_SCALE, report)
      }
      pages.push(raw)
      if (i <= PREVIEW_PAGES) {
        // תמונה היא תוספת: אם הציור נכשל, הקריאה עצמה ממשיכה
        try {
          const url = await renderPage(page as unknown as RenderablePage)
          if (url) images.push(url)
        } catch (err) {
          console.warn('ציור העמוד נכשל', err)
        }
      }
    }
    const draft = parsePages(pages)
    return { draft: scanned ? withOcrWarning(draft) : draft, pages: images }
  } finally {
    await task.destroy()
  }
}
