import { beforeAll, describe, expect, it } from 'vitest'
import { readPdfPages } from './readNode'
import { parsePages, dateFromFileName } from '../parseSchedule'
import { applySelection, collectSubjects, findConflicts, initialSelection } from '../whoami'
import { initialData } from '../../../data/initial'
import { formatTime, DAY_NAMES } from '../../time'
import type { DraftItem, DraftSchedule } from '../draft'

/**
 * בדיקה מקצה לקצה על הקובץ האמיתי של המכינה (מעודכן ל-18.10.2026).
 * התוצאה הצפויה = המערכת של יוחאי, כפי שבנינו אותה ידנית ב-src/data/initial.ts.
 */
const FILE = new URL('./files/mechina-2026-10-18.pdf', import.meta.url).pathname

let draft: DraftSchedule
beforeAll(async () => {
  draft = parsePages(await readPdfPages(decodeURIComponent(FILE)))
}, 30_000)

const line = (i: DraftItem) =>
  `${DAY_NAMES[i.day]} ${formatTime(i.start)}-${formatTime(i.end)} ${i.options
    .map((o) => [o.name, o.teacher, o.room].filter(Boolean).join(' / '))
    .join(' | ')}`

describe('המערכת של המכינה', () => {
  it('קוראת את טבלת המרצים כולל רמה, חדר והערת סמסטר', () => {
    const t = Object.fromEntries((draft.teachers ?? []).map((t) => [`${t.fullName}|${t.subject}`, t]))
    expect(t['רונן שחק|מתמטיקה']).toMatchObject({ room: 'סמסון 177', detail: "5 יח'" })
    expect(t['שרגא פרייס|אנגלית']).toMatchObject({ room: 'ויילר 243', detail: 'טרום בסיס א' })
    expect(t['דוד קסל|פיזיקה']).toMatchObject({ room: 'ויילר 243' })
    expect(t['דניאל מנחם|כתיבה מדעית']).toMatchObject({ note: "קורס סמסטר א' בלבד" })
  })

  it('תאריך הגרסה נלקח משם הקובץ', () => {
    expect(dateFromFileName('מערכת_הנדסה_-_מעודכנת_נכון_לתאריך_18_10_2026_1_.PDF')).toBe('18.10.2026')
  })

  it('האשף מנחש את הקבוצות שלי ובוחר לבד את קבוצה 3 בכתיבה מדעית', () => {
    const subjects = collectSubjects(draft.items, draft.teachers)
    const sel = initialSelection(subjects, initialData, draft.items, draft.teachers)
    expect(sel.variants).toMatchObject({
      מתמטיקה: 'רונן שחק',
      אנגלית: 'שרגא פרייס',
      פיזיקה: 'דוד קסל',
      'כתיבה מדעית': 'קבוצה 3',
    })
    expect(sel.auto?.['כתיבה מדעית']).toBeTruthy()
    expect(sel.subjects['מבוא למחשבים']).toBe(false)
  })

  it('המערכת שלי: כל שיעור עם מרצה וחדר, בלי התנגשויות', () => {
    const subjects = collectSubjects(draft.items, draft.teachers)
    const sel = initialSelection(subjects, initialData, draft.items, draft.teachers)
    const mine = applySelection(draft.items, sel, draft.teachers)

    expect(findConflicts(mine)).toEqual([])
    expect(mine.every((i) => i.options.length === 1)).toBe(true)
    for (const i of mine) {
      expect(i.options[0].teacher, line(i)).toBeTruthy()
      if (i.options[0].name !== 'כתיבה מדעית') expect(i.options[0].room, line(i)).toBeTruthy()
    }

    expect(mine.map(line)).toEqual([
      'ראשון 13:30-15:00 מתמטיקה / רונן שחק / סמסון 177',
      'ראשון 15:15-16:45 מתמטיקה / רונן שחק / סמסון 177',
      'ראשון 17:00-17:45 מתמטיקה / רונן שחק / סמסון 177',
      'ראשון 17:45-18:30 אנגלית / שרגא פרייס / ויילר 243',
      'ראשון 18:45-20:15 אנגלית / שרגא פרייס / ויילר 243',
      'שני 13:30-15:00 פיזיקה / דוד קסל / ויילר 243',
      'שני 15:15-16:45 פיזיקה / דוד קסל / ויילר 243',
      'שני 17:00-17:45 פיזיקה / דוד קסל / ויילר 243',
      'שני 17:45-18:30 מתמטיקה / רונן שחק / סמסון 177',
      'שני 18:45-20:15 מתמטיקה / רונן שחק / סמסון 177',
      'שלישי 13:30-15:00 אנגלית / שרגא פרייס / ויילר 243',
      'שלישי 15:15-16:00 אנגלית / שרגא פרייס / ויילר 243',
      'שלישי 16:00-16:45 פיזיקה / דוד קסל / ויילר 243',
      'שלישי 17:00-18:30 פיזיקה / דוד קסל / ויילר 243',
      'שלישי 18:45-20:15 פיזיקה / דוד קסל / ויילר 243',
      'רביעי 13:30-15:00 פיזיקה / דוד קסל / ויילר 243',
      'רביעי 15:15-16:00 פיזיקה / דוד קסל / ויילר 243',
      'רביעי 16:00-16:45 אנגלית / שרגא פרייס / ויילר 243',
      'רביעי 17:00-18:30 אנגלית / שרגא פרייס / ויילר 243',
      'רביעי 18:45-20:15 כתיבה מדעית / דניאל מנחם',
      'חמישי 13:30-15:00 מתמטיקה / רונן שחק / סמסון 177',
      'חמישי 15:15-16:45 מתמטיקה / רונן שחק / סמסון 177',
      'חמישי 17:00-17:45 מתמטיקה / רונן שחק / סמסון 177',
    ])
  })
})
