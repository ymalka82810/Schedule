import { describe, expect, it } from 'vitest'
import { detectLines, eraseLines, toRawPage, type Bitmap } from '../ocr'
import { buildTable } from '../grid'
import { fillDays } from '../parseSchedule'

/** תמונה לבנה עם ציור של מלבנים שחורים */
function bitmap(w: number, h: number, rects: Array<[number, number, number, number]>): Bitmap {
  const data = new Uint8ClampedArray(w * h * 4).fill(255)
  for (const [x0, y0, x1, y1] of rects) {
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const p = (y * w + x) * 4
        data[p] = data[p + 1] = data[p + 2] = 0
      }
  }
  return { width: w, height: h, data }
}

/** טבלה של 3 עמודות ו-2 שורות, קווים בעובי 2, ו\"מילה\" עם פס עליון וגבעולים בתא הראשון */
const W = 600
const H = 300
const grid: Array<[number, number, number, number]> = [
  [50, 50, 550, 52],
  [50, 150, 550, 152],
  [50, 250, 550, 252],
  [50, 50, 52, 252],
  [216, 50, 218, 252],
  [383, 50, 385, 252],
  [548, 50, 550, 252],
]
// אותיות: פס עליון ארוך (כמו שורת \"ה\" \"ד\" צמודות) עם גבעולים צפופים מתחתיו
const word: Array<[number, number, number, number]> = [[70, 90, 180, 93]]
for (let x = 70; x < 180; x += 6) word.push([x, 93, x + 2, 115])

describe('זיהוי קווי טבלה בתמונה', () => {
  const img = bitmap(W, H, [...grid, ...word])
  const lines = detectLines(img)

  it('מוצא את קווי הטבלה, ולא את הפס של האותיות', () => {
    expect(lines.h.map((l) => Math.round(l.at))).toEqual([51, 151, 251])
    expect(lines.v.map((l) => Math.round(l.at))).toEqual([51, 217, 384, 549])
  })

  it('קו עם חורים קטנים (סריקה לא נקייה) נשאר קו אחד', () => {
    const broken = bitmap(W, H, [
      [50, 50, 200, 52],
      [202, 50, 550, 52],
    ])
    expect(detectLines(broken).h).toHaveLength(1)
  })

  it('הטבלה נבנית מהקווים שנמצאו, בנקודות ו-y כלפי מעלה', () => {
    const page = toRawPage(img, lines, [{ text: 'פיזיקה', x0: 70, y0: 90, x1: 180, y1: 115, confidence: 60 }], 2)
    const table = buildTable(page)!
    expect(table.rows).toBe(2)
    expect(table.cols).toBe(3)
    expect(page.words[0]).toMatchObject({ x: 35, y: (H - 115) / 2, doubt: true })
    // המילה נופלת בתא השמאלי העליון
    const cell = table.cells.find((c) => c.words.length)!
    expect([cell.r1, cell.c1]).toEqual([0, 0])
  })

  it('מחיקת הקווים משאירה את האותיות', () => {
    const copy = bitmap(W, H, [...grid, ...word])
    eraseLines(copy, lines)
    const dark = (x: number, y: number) => copy.data[(y * W + x) * 4] === 0
    expect(dark(300, 51)).toBe(false)
    expect(dark(100, 91)).toBe(true)
  })
})

describe('השלמת ימים שלא זוהו', () => {
  it('בטבלה מימין לשמאל משלים את העמודות שבין הימים שזוהו', () => {
    const got = fillDays(new Map([[4, 0], [1, 3], [0, 4]]))
    expect([...got].sort((a, b) => a[0] - b[0])).toEqual([[0, 4], [1, 3], [2, 2], [3, 1], [4, 0]])
  })

  it('לא משלים כשהימים לא בסדר עקבי', () => {
    const map = new Map([[0, 0], [1, 3], [2, 1]] as Array<[number, 0 | 1 | 3]>)
    expect(fillDays(map).size).toBe(3)
  })
})
