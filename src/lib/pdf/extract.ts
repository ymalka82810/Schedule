import { pageToRaw, type PdfOps, type PdfPageLike, type RawPage } from './raw'
import { parsePages } from './parseSchedule'
import type { DraftSchedule } from './draft'

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

/**
 * קורא קובץ PDF בדפדפן ומחזיר טיוטת מערכת ותמונות של העמודים.
 * הספרייה נטענת רק כשצריך, כדי שהאתר עצמו יישאר קל.
 */
export async function readSchedulePdf(file: File): Promise<PdfReadResult> {
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
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      pages.push(await pageToRaw(page as unknown as PdfPageLike, pdfjs.OPS as unknown as PdfOps))
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
    return { draft: parsePages(pages), pages: images }
  } finally {
    await task.destroy()
  }
}
