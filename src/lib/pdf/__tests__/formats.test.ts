import { readFileSync, readdirSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { readPdfPages } from './readNode'
import { parsePages } from '../parseSchedule'
import type { DraftItem, DraftSchedule } from '../draft'

/**
 * מערכות שעות מדומות בפורמטים שנמצאו ברשת (שחף, מסמך גוגל של בית ספר, אוניברסיטה, מכללה, טכניון,
 * בית ספר באנגלית, ימים בשורות). נוצרו עם scripts/simulate-timetables.py. לכל קובץ יש JSON
 * עם השיעורים הצפויים: כל שיעור צריך להימצא בדיוק (יום, שעות ושם), ובלי שיבוצים מיותרים.
 */
const DIR = decodeURIComponent(new URL('./files/formats/', import.meta.url).pathname)
const NAMES = readdirSync(DIR)
  .filter((f) => f.endsWith('.pdf'))
  .map((f) => f.replace(/\.pdf$/, ''))
  .sort()

interface Expected {
  note: string
  lessons: Array<{ day: number; start: number; end: number; name: string }>
}

const clean = (s: string) => s.replace(/[^א-תA-Za-z0-9]/g, '').toLowerCase()
const hm = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
const show = (i: DraftItem) => `${i.day} ${hm(i.start)}-${hm(i.end)} ${i.options.map((o) => o.name).join(' | ')}`

const drafts = new Map<string, DraftSchedule>()
beforeAll(async () => {
  for (const n of NAMES) drafts.set(n, parsePages(await readPdfPages(`${DIR}${n}.pdf`)))
}, 60_000)

describe.each(NAMES)('%s', (name) => {
  const exp: Expected = JSON.parse(readFileSync(`${DIR}${name}.json`, 'utf8'))

  it(`כל השיעורים, בלי מיותרים (${exp.note})`, () => {
    const draft = drafts.get(name)!
    const got = draft.items.map(show).sort()
    const want = exp.lessons
      .map((l) => `${l.day} ${hm(l.start)}-${hm(l.end)} ${l.name}`)
      .sort()
    expect(draft.items.map((i) => `${i.day} ${hm(i.start)}-${hm(i.end)} ${clean(i.options[0].name)}`).sort()).toEqual(
      exp.lessons.map((l) => `${l.day} ${hm(l.start)}-${hm(l.end)} ${clean(l.name.replace(/^(תר|מע)\.\s*/, ''))}`).sort(),
    )
    expect(got.length, want.join('\n')).toBe(want.length)
  })
})

const first = (name: string, subject: string) =>
  drafts.get(name)!.items.find((i) => i.options[0].name === subject)!.options[0]

describe('מורה וחדר בלי טבלת מרצים', () => {
  it('שורות נפרדות בתא: מקצוע / מורה / חדר', () => {
    expect(first('control-mechina-like', 'מתמטיקה')).toMatchObject({ teacher: 'כהן', room: '12' })
    expect(first('control-mechina-like', 'היסטוריה')).toMatchObject({ teacher: 'מזרחי', room: '8' })
  })

  it('מילה שנשברה באמצע בגלל רוחב העמודה מתחברת ("מתמטיק" + "ה")', () => {
    expect(first('control-libreoffice', 'מתמטיקה')).toMatchObject({ teacher: 'כהן', room: '12' })
    expect(first('control-libreoffice', 'לשון')).toMatchObject({ teacher: 'אברהם' })
  })

  it('מורה בסוגריים וחדר אחרי המילה "חדר"', () => {
    expect(first('school-shahaf', 'פיזיקה')).toMatchObject({ teacher: 'ביטון', room: 'מעבדה' })
    expect(first('school-gdocs-dates', 'אנגלית')).toMatchObject({ teacher: 'לוי', room: '14' })
  })

  it('באנגלית: Mr. ו-Room', () => {
    expect(first('english-school', 'Math')).toMatchObject({ teacher: 'כהן', room: '12' })
  })

  it('רשימת קורסים: מרצה, חדר וסוג מהעמודות', () => {
    const items = drafts.get('college-list')!.items
    expect(items[0].options[0]).toMatchObject({ name: 'מבוא למיקרו כלכלה', teacher: 'ארז צח', room: '204', kind: 'תרגול' })
    const tech = drafts.get('technion-courses')!.items.filter((i) => i.options[0].name === 'יסודות למידה והוראה')
    expect(tech.sort((a, b) => a.start - b.start).map((i) => i.options[0].kind ?? '')).toEqual(['', 'תרגול'])
  })

  it('קוד קורס לא נכנס לשם, ו"תר." הוא תרגול', () => {
    const bgu = drafts.get('university-bgu')!.items
    expect(bgu.some((i) => /\d{3}\./.test(i.options[0].name))).toBe(false)
    expect(bgu.find((i) => i.options[0].name === 'חדו"א 1' && i.options[0].kind === 'תרגול')).toBeTruthy()
  })
})
