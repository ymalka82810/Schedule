import { pageToRaw, type PdfOps, type PdfPageLike, type RawPage } from './raw'
import { parsePages } from './parseSchedule'
import type { DraftSchedule } from './draft'

/**
 * קורא קובץ PDF בדפדפן ומחזיר טיוטת מערכת.
 * הספרייה נטענת רק כשצריך, כדי שהאתר עצמו יישאר קל.
 */
export async function readSchedulePdf(file: File): Promise<DraftSchedule> {
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
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      pages.push(await pageToRaw(page as unknown as PdfPageLike, pdfjs.OPS as unknown as PdfOps))
    }
    return parsePages(pages)
  } finally {
    await task.destroy()
  }
}
