import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { beforeAll, describe, expect, it } from 'vitest'
import { CROP_MARGIN, PSM_OF, cropZoom, ocrImage, wordsOfLines, type OcrLine } from '../ocr'
import { parsePages } from '../parseSchedule'
import { readPdfPages } from './readNode'
import type { DraftItem, DraftSchedule } from '../draft'
import type { RawPage } from '../raw'

/**
 * בדיקה מקצה לקצה של קריאה מתמונה: מציירים את קובץ המכינה כתמונה (בלי שכבת טקסט ובלי קווים מצוירים),
 * מעבירים בזיהוי תווים אמיתי, ומשווים לקריאה הרגילה של הקובץ.
 * איטית (כחצי דקה), ולכן רצה רק ב-npm run test:ocr.
 */
const RUN = !!process.env.OCR_TEST
const FILE = decodeURIComponent(new URL('./files/mechina-2026-10-18.pdf', import.meta.url).pathname)
const SCALE = 3

const key = (i: DraftItem) =>
  `${i.day} ${i.start}-${i.end} ${i.options.map((o) => [o.name, o.teacher, o.group].filter(Boolean).join('/')).join(' | ')}`

let ocr: DraftSchedule
let text: DraftSchedule

beforeAll(async () => {
  if (!RUN) return
  const require = createRequire(import.meta.url)
  const { createCanvas } = require('@napi-rs/canvas')
  const { createWorker } = await import('tesseract.js')
  const lang = mkdtempSync(join(tmpdir(), 'tess-'))
  for (const l of ['heb', 'eng']) {
    copyFileSync(require.resolve(`@tesseract.js-data/${l}/4.0.0_best_int/${l}.traineddata.gz`), join(lang, `${l}.traineddata.gz`))
  }
  const worker = await createWorker(['heb', 'eng'], 1, { langPath: lang, gzip: true, cachePath: lang })
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = pdfjs.getDocument({ data: new Uint8Array(readFileSync(FILE)) })
  const doc = await task.promise
  const pages: RawPage[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const viewport = page.getViewport({ scale: SCALE })
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvas, viewport } as never).promise
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
    pages.push(
      await ocrImage(img, SCALE, (erased) => {
        ctx.putImageData(erased, 0, 0)
        const png = canvas.toBuffer('image/png')
        return async (rect, mode) => {
          await worker.setParameters({
            tessedit_pageseg_mode: PSM_OF[mode] as never,
            preserve_interword_spaces: '1',
          })
          // כמו בדפדפן: כל תא כתמונה קטנה עם שוליים לבנים, ותא קטן מוגדל
          let source: Buffer = png
          const m = CROP_MARGIN
          const z = rect ? cropZoom(rect) : 1
          if (rect) {
            const c = createCanvas(rect.width * z + 2 * m, rect.height * z + 2 * m)
            const cx = c.getContext('2d')
            cx.fillStyle = '#fff'
            cx.fillRect(0, 0, c.width, c.height)
            cx.drawImage(canvas, rect.left, rect.top, rect.width, rect.height, m, m, rect.width * z, rect.height * z)
            source = c.toBuffer('image/png')
          }
          const { data } = await worker.recognize(source, {}, { blocks: true })
          const words = wordsOfLines((data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines)) as OcrLine[])
          if (!rect) return words
          const back = (v: number, o: number) => (v - m) / z + o
          return words.map((w) => ({ ...w, x0: back(w.x0, rect.left), x1: back(w.x1, rect.left), y0: back(w.y0, rect.top), y1: back(w.y1, rect.top) }))
        }
      }),
    )
  }
  await worker.terminate()
  await task.destroy()
  ocr = parsePages(pages)
  text = parsePages(await readPdfPages(FILE))
}, 180_000)

describe.runIf(RUN)('קריאת המערכת מתמונה (OCR)', () => {
  it('מוצאת את טבלת המערכת ואת כל המרצים', () => {
    expect(ocr.warnings).toEqual([])
    expect(ocr.teachers?.length).toBe(text.teachers?.length)
  })

  it('לפחות 85% מהשיבוצים יוצאים זהים לקריאה מקובץ עם טקסט', () => {
    const expected = new Set(text.items.map(key))
    const same = ocr.items.map(key).filter((k) => expected.has(k)).length
    console.log(`OCR: ${same} מתוך ${expected.size} שיבוצים זהים`)
    expect(same / expected.size).toBeGreaterThanOrEqual(0.85)
  })
})
