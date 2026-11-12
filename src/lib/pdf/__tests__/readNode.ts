import { readFileSync } from 'node:fs'
import { pageToRaw, type PdfOps, type PdfPageLike, type RawPage } from '../raw'

/** קורא PDF ב-Node, לבדיקות. אותו מסלול כמו בדפדפן, בלי ציור */
export async function readPdfPages(path: string): Promise<RawPage[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const data = new Uint8Array(readFileSync(path))
  const task = pdfjs.getDocument({ data, useSystemFonts: false })
  const doc = await task.promise
  const pages: RawPage[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    pages.push(await pageToRaw(page as unknown as PdfPageLike, pdfjs.OPS as unknown as PdfOps))
  }
  await task.destroy()
  return pages
}
