import { describe, expect, it } from 'vitest'
import { initialData } from '../../data/initial'
import { emptyData } from '../../data/empty'
import {
  addLesson,
  chooseOption,
  fromBackup,
  moveEntry,
  removeEntry,
  resolveBlock,
  toBackup,
  updateLesson,
} from '../edit'
import { buildBlocks } from '../layout'
import type { ScheduleData } from '../../types'

const withChoice: ScheduleData = {
  ...initialData,
  lessons: [...initialData.lessons, { id: 'cs', name: 'מבוא למחשבים', color: 'teal' }],
  choiceGroups: [
    { id: 'g1', slot: { day: 5, start: 600, end: 660 }, optionLessonIds: ['physics', 'cs'], chosenLessonId: null },
  ],
}

describe('resolveBlock', () => {
  it('מוצא שיבוץ, חלון תרגול ומשבצת בחירה לפי המזהה של הבלוק', () => {
    const blocks = buildBlocks(withChoice)
    for (const b of blocks) expect(resolveBlock(withChoice, b.id)).not.toBeNull()
    expect(resolveBlock(withChoice, 'g1:cs')).toMatchObject({ kind: 'choice' })
    expect(resolveBlock(withChoice, 'e1')).toMatchObject({ kind: 'entry', lesson: { id: 'migo' } })
    expect(resolveBlock(withChoice, 'p1')).toMatchObject({ kind: 'practice' })
  })
})

describe('עריכה', () => {
  it('שינוי שיעור חל על כל השיבוצים שלו, בלי לשנות את המקור', () => {
    const next = updateLesson(initialData, 'math', { room: 'סמסון 200', color: 'rose' })
    const mathBlocks = buildBlocks(next).filter((b) => b.name === 'מתמטיקה')
    expect(mathBlocks.every((b) => b.room === 'סמסון 200' && b.color === 'rose')).toBe(true)
    expect(initialData.lessons.find((l) => l.id === 'math')!.room).toBe('סמסון 177')
  })

  it('הזזה ומחיקה של שיבוץ. שיעור שנשאר בלי שיבוצים נמחק', () => {
    const moved = moveEntry(initialData, 'e1', { day: 2, start: 480, end: 540 })
    expect(moved.entries.find((e) => e.id === 'e1')!.slot.day).toBe(2)

    const writingEntry = initialData.entries.find((e) => e.lessonId === 'writing')!
    const removed = removeEntry(initialData, writingEntry.id)
    expect(removed.lessons.some((l) => l.id === 'writing')).toBe(false)
    expect(removed.lessons.some((l) => l.id === 'math')).toBe(true)
  })

  it('בחירה במשבצת בחירה מציגה רק את מה שנבחר, וביטול מחזיר הכול', () => {
    const chosen = chooseOption(withChoice, 'g1', 'cs')
    expect(buildBlocks(chosen).filter((b) => b.id.startsWith('g1:'))).toHaveLength(1)
    const reset = chooseOption(chosen, 'g1', null)
    expect(buildBlocks(reset).filter((b) => b.id.startsWith('g1:'))).toHaveLength(2)
  })

  it('הוספת שיעור: חדש מסומן אישי, ושם ומרצה קיימים מצטרפים לשיעור הקיים', () => {
    const slot = { day: 5 as const, start: 600, end: 660 }
    const a = addLesson(emptyData, { name: ' חוג ', color: 'moss', slot })
    expect(a.lessons).toHaveLength(1)
    expect(a.lessons[0]).toMatchObject({ name: 'חוג', personal: true })

    const b = addLesson(initialData, { name: 'מתמטיקה', teacher: 'רונן שחק', color: 'moss', slot })
    expect(b.lessons).toHaveLength(initialData.lessons.length)
    expect(b.entries.at(-1)!.lessonId).toBe('math')
    expect(new Set(b.entries.map((e) => e.id)).size).toBe(b.entries.length)
  })
})

describe('גיבוי', () => {
  it('ייצוא וייבוא מחזירים את אותם נתונים', () => {
    const back = fromBackup(toBackup(initialData))
    expect('data' in back && back.data).toEqual(initialData)
  })

  it('דוחה קבצים שאינם גיבוי', () => {
    expect(fromBackup('לא json')).toHaveProperty('error')
    expect(fromBackup('{"a":1}')).toHaveProperty('error')
    const broken = { ...initialData, entries: [{ id: 'x', lessonId: 'nope', slot: { day: 0, start: 0, end: 1 } }] }
    expect(fromBackup(JSON.stringify(broken))).toHaveProperty('error')
  })
})

describe('שבוע מסוים', () => {
  const WEEK = new Date(2026, 10, 15)
  it('ביטול בשבוע אחד מסמן את הבלוק רק בשבוע הזה, ולחיצה שנייה מחזירה', async () => {
    const { toggleCancellation } = await import('../edit')
    const once = toggleCancellation(initialData, 'e1', '2026-11-16')
    const cancelled = (data: ScheduleData, week: Date) => buildBlocks(data, { weekStart: week }).find((b) => b.id === 'e1')!.isCancelled
    expect(cancelled(once, WEEK)).toBe(true)
    expect(cancelled(once, new Date(2026, 10, 22))).toBeUndefined()
    expect(toggleCancellation(once, 'e1', '2026-11-16').cancellations).toEqual([])
  })

  it('אירוע מוצג רק בשבוע שלו, לצד שיעור באותה שעה', async () => {
    const { saveEvent } = await import('../edit')
    const data = saveEvent(initialData, { title: 'בר מצווה', date: '2026-11-15', start: 14 * 60, end: 16 * 60 })
    const blocks = buildBlocks(data, { weekStart: WEEK })
    const ev = blocks.find((b) => b.type === 'event')!
    expect(ev).toMatchObject({ day: 0, name: 'בר מצווה', lanes: 2 })
    expect(buildBlocks(data, { weekStart: new Date(2026, 10, 22) }).some((b) => b.type === 'event')).toBe(false)
  })
})
