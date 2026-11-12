import { describe, expect, it } from 'vitest'
import { applySelection, collectSubjects, findConflicts, initialSelection, needsWizard, variantClashes, withWizard } from '../whoami'
import { emptyData } from '../../../data/empty'
import { initialData } from '../../../data/initial'
import { item, mechinaDraft } from './fixtures'

describe('collectSubjects', () => {
  it('מוצא את המקצועות ואת הקבוצות או המרצים בכל מקצוע', () => {
    const subjects = collectSubjects(mechinaDraft())
    const byName = Object.fromEntries(subjects.map((s) => [s.name, s]))

    expect(byName['מתמטיקה'].by).toBe('teacher')
    expect(byName['מתמטיקה'].variants.map((v) => v.key)).toEqual(['אבי דיין', 'יוסי קמיל', 'רונן שחק'])

    expect(byName['כתיבה מדעית'].by).toBe('group')
    expect(byName['כתיבה מדעית'].variants.map((v) => v.key)).toEqual(['קבוצה 1', 'קבוצה 2', 'קבוצה 3'])
    expect(byName['כתיבה מדעית'].variants[0].label).toBe('קבוצה 1 (דניאל מנחם)')

    // מקצוע עם אפשרות אחת בלבד: אין מה לבחור
    expect(byName['פיזיקה'].variants).toEqual([])
    expect(byName['מבוא למחשבים'].variants).toEqual([])
  })

  it('מקצוע בלי קבוצות ובלי מרצים לא דורש אשף', () => {
    expect(needsWizard([item(0, '09:00', '10:00', { name: 'חשבון' })])).toBe(false)
    expect(needsWizard(mechinaDraft())).toBe(true)
  })
})

describe('initialSelection', () => {
  it('בלי מערכת שמורה: כל המקצועות, בלי בחירת קבוצה', () => {
    const subjects = collectSubjects(mechinaDraft())
    const sel = initialSelection(subjects)
    expect(Object.values(sel.subjects).every(Boolean)).toBe(true)
    expect(Object.values(sel.variants).every((v) => v === null)).toBe(true)
  })

  it('עם המערכת השמורה: מנחש את המקצועות והמרצים שלי', () => {
    const subjects = collectSubjects(mechinaDraft())
    const sel = initialSelection(subjects, initialData)
    expect(sel.subjects['מבוא למחשבים']).toBe(false)
    expect(sel.subjects['פיזיקה']).toBe(true)
    expect(sel.variants['מתמטיקה']).toBe('רונן שחק')
    expect(sel.variants['אנגלית']).toBe('שרגא פרייס')
  })
})

describe('applySelection', () => {
  it('משאיר רק את הקבוצות שלי ומוריד מגמה שאני לא לומד', () => {
    const items = mechinaDraft()
    const sel = initialSelection(collectSubjects(items), initialData)
    sel.variants['כתיבה מדעית'] = 'קבוצה 3'
    const mine = applySelection(items, sel)

    expect(mine.every((i) => i.options.length === 1)).toBe(true)
    const names = mine.map((i) => `${i.day} ${i.options[0].name} ${i.options[0].teacher ?? ''}`)
    expect(names).not.toContain(expect.stringContaining('קמיל'))
    expect(mine.some((i) => i.options[0].name === 'מבוא למחשבים')).toBe(false)
    expect(mine.filter((i) => i.options[0].name === 'כתיבה מדעית')).toHaveLength(1)
    expect(findConflicts(mine)).toEqual([])
  })

  it('"עוד לא יודע" משאיר את כל הקבוצות כמשבצת בחירה', () => {
    const items = mechinaDraft()
    const sel = initialSelection(collectSubjects(items))
    const all = applySelection(items, sel)
    expect(all[0].options).toHaveLength(3)
  })

  it('מאחד שיבוצים רצופים שהפכו זהים אחרי הסינון', () => {
    const items = [
      item(0, '09:00', '10:00', { name: 'מתמטיקה', teacher: 'א' }, { name: 'מתמטיקה', teacher: 'ב' }),
      item(0, '10:00', '11:00', { name: 'מתמטיקה', teacher: 'א' }),
    ]
    const sel = initialSelection(collectSubjects(items))
    sel.variants['מתמטיקה'] = 'א'
    const out = applySelection(items, sel)
    expect(out).toHaveLength(1)
    expect([out[0].start, out[0].end]).toEqual([540, 660])
  })
})

describe('התנגשויות', () => {
  it('מזהה שקבוצות 1 ו-2 של כתיבה מדעית מתנגשות עם האנגלית שלי, וקבוצה 3 פנויה', () => {
    const items = mechinaDraft()
    const subjects = collectSubjects(items)
    const sel = initialSelection(subjects, initialData)
    const writing = subjects.find((s) => s.name === 'כתיבה מדעית')!
    const clashes = variantClashes(items, sel, writing)

    expect(clashes.get('קבוצה 1')?.names).toEqual(['אנגלית'])
    expect(clashes.get('קבוצה 2')?.names).toEqual(['אנגלית'])
    expect(clashes.has('קבוצה 3')).toBe(false)
  })

  it('שתי מגמות שנבחרו יחד הן התנגשות, קבוצות של אותו מקצוע לא', () => {
    const items = mechinaDraft()
    const sel = initialSelection(collectSubjects(items))
    const conflicts = findConflicts(applySelection(items, sel))
    expect(conflicts.some((c) => c.names.includes('מבוא למחשבים'))).toBe(true)
    expect(conflicts.some((c) => c.names.every((n) => n.startsWith('מתמטיקה')))).toBe(false)
  })
})

describe('בחירות שמורות של האשף', () => {
  it('ייבוא בסביבה ריקה משתמש בבחירות ששמרתי, ולא בניחוש', () => {
    const subjects = collectSubjects(mechinaDraft())
    const saved = withWizard(emptyData, {
      subjects: { 'מבוא למחשבים': false },
      variants: { 'מתמטיקה': 'רונן שחק', 'כתיבה מדעית': 'קבוצה 9' },
    })
    const sel = initialSelection(subjects, saved)
    expect(sel.subjects['מבוא למחשבים']).toBe(false)
    expect(sel.subjects['פיזיקה']).toBe(true)
    expect(sel.variants['מתמטיקה']).toBe('רונן שחק')
    // קבוצה שכבר לא קיימת בקובץ לא נבחרת
    expect(sel.variants['כתיבה מדעית']).not.toBe('קבוצה 9')
  })

  it('שמירה חדשה לא מוחקת בחירות של מקצועות שלא הופיעו בקובץ', () => {
    const first = withWizard(emptyData, { subjects: { 'אנגלית': true }, variants: { 'אנגלית': 'שרגא פרייס' } })
    const second = withWizard(first, { subjects: { 'מתמטיקה': true }, variants: { 'מתמטיקה': 'רונן שחק' } })
    expect(second.wizard!.variants).toEqual({ 'אנגלית': 'שרגא פרייס', 'מתמטיקה': 'רונן שחק' })
  })
})
