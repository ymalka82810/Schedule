import { describe, expect, it } from 'vitest'
import { initialData } from '../../data/initial'
import { changeKey, diffSchedules, hasImported, rejectChanges } from '../diff'
import { moveEntry, removeEntry, updateLesson } from '../edit'
import { draftToData } from '../pdf/toSchedule'
import { item } from '../pdf/__tests__/fixtures'

describe('diffSchedules', () => {
  it('אין שינויים מול עצמה', () => {
    expect(diffSchedules(initialData, initialData)).toEqual([])
  })

  it('מזהה שיעור שזז, שבוטל ושהמרצה שלו השתנה', () => {
    const englishSun = initialData.entries.find((e) => e.lessonId === 'english' && e.slot.day === 0)!
    const writing = initialData.entries.find((e) => e.lessonId === 'writing')!
    let next = moveEntry(initialData, englishSun.id, { day: 0, start: 19 * 60, end: 20 * 60 })
    next = removeEntry(next, writing.id)
    next = updateLesson(next, 'physics', { teacher: 'משה לוי' })

    const changes = diffSchedules(initialData, next)
    const kinds = (k: string) => changes.filter((c) => c.kind === k)

    expect(kinds('moved')).toHaveLength(1)
    expect(kinds('moved')[0].label).toContain('אנגלית')
    expect(kinds('removed').map((c) => c.label)).toEqual([expect.stringContaining('כתיבה מדעית')])
    // כל שיבוצי הפיזיקה באותן שעות, עם מרצה אחר
    expect(kinds('changed').length).toBe(initialData.entries.filter((e) => e.lessonId === 'physics').length)
    expect(kinds('changed')[0].before!.label).toContain('דוד קסל')
  })

  it('שיעורים אישיים לא נכללים', () => {
    const migo = initialData.entries.find((e) => e.lessonId === 'migo')!
    expect(diffSchedules(initialData, removeEntry(initialData, migo.id))).toEqual([])
  })
})

describe('ייבוא גרסה חדשה שומר על ההתאמות האישיות', () => {
  it('צבע שבחרתי למקצוע נשמר', () => {
    const base = updateLesson(initialData, 'math', { color: 'rose' })
    const data = draftToData([item(0, '09:00', '10:00', { name: 'מתמטיקה', teacher: 'רונן שחק' })], base)
    expect(data.lessons.find((l) => l.name === 'מתמטיקה')!.color).toBe('rose')
  })

  it('בחירה במשבצת בחירה נשמרת כשהשיעור קיים גם בגרסה החדשה', () => {
    const options = [{ name: 'פיזיקה', teacher: 'דוד קסל' }, { name: 'מבוא למחשבים' }]
    const first = draftToData([item(1, '13:30', '15:00', ...options)], initialData)
    const g = first.choiceGroups[0]
    const physics = first.lessons.find((l) => l.name === 'פיזיקה' && l.teacher === 'דוד קסל')!
    const chosen = { ...first, choiceGroups: [{ ...g, chosenLessonId: physics.id }] }

    // גרסה חדשה: אותה משבצת, הוזזה ברבע שעה
    const second = draftToData([item(1, '13:45', '15:15', ...options)], chosen)
    const chosenNow = second.lessons.find((l) => l.id === second.choiceGroups[0].chosenLessonId)
    expect(chosenNow).toMatchObject({ name: 'פיזיקה', teacher: 'דוד קסל' })
  })

  it('שומר מאיזה קובץ נבנתה המערכת', () => {
    const data = draftToData([item(0, '09:00', '10:00', { name: 'א' })], initialData, {
      fileName: 'מערכת.pdf',
      versionDate: '18.10.2026',
    })
    expect(data.source).toMatchObject({ fileName: 'מערכת.pdf', versionDate: '18.10.2026' })
    expect(hasImported(data)).toBe(true)
  })
})

describe('ויתור על שינויים בגרסה חדשה', () => {
  const englishSun = initialData.entries.find((e) => e.lessonId === 'english' && e.slot.day === 0)!
  const writing = initialData.entries.find((e) => e.lessonId === 'writing')!
  let next = moveEntry(initialData, englishSun.id, { day: 0, start: 19 * 60, end: 20 * 60 })
  next = removeEntry(next, writing.id)
  const changes = diffSchedules(initialData, next)

  it('ויתור על הכול מחזיר את המערכת השמורה', () => {
    expect(diffSchedules(initialData, rejectChanges(initialData, next, changes))).toEqual([])
  })

  it('ויתור על שינוי אחד משאיר את השאר', () => {
    const removed = changes.filter((c) => c.kind === 'removed')
    const result = rejectChanges(initialData, next, removed)
    const left = diffSchedules(initialData, result)
    expect(left.map((c) => c.kind)).toEqual(['moved'])
    // השיעור שבוטל חזר, עם השיעור שלו
    expect(result.entries.some((e) => e.slot.day === writing.slot.day && e.slot.start === writing.slot.start)).toBe(true)
  })

  it('לכל שינוי מפתח שונה', () => {
    expect(new Set(changes.map(changeKey)).size).toBe(changes.length)
  })
})
