import { describe, expect, it } from 'vitest'
import { draftToData, validateDraft } from '../toSchedule'
import { initialData } from '../../../data/initial'
import { item } from './fixtures'

describe('draftToData', () => {
  it('שיעור יחיד = שיבוץ קבוע, כמה במקביל = משבצת בחירה, ואותו שיעור לא נוצר פעמיים', () => {
    const items = [
      item(0, '09:00', '10:00', { name: 'מתמטיקה', teacher: 'א' }),
      item(1, '09:00', '10:00', { name: 'מתמטיקה', teacher: 'א' }),
      item(2, '09:00', '10:00', { name: 'פיזיקה' }, { name: 'מבוא למחשבים' }),
    ]
    const data = draftToData(items, initialData)
    const imported = data.lessons.filter((l) => !l.personal)
    expect(imported.map((l) => l.name).sort()).toEqual(['מבוא למחשבים', 'מתמטיקה', 'פיזיקה'])
    expect(data.choiceGroups).toHaveLength(1)
  })

  it('שומר שיעורים אישיים וחלונות תרגול', () => {
    const data = draftToData([item(0, '09:00', '10:00', { name: 'מתמטיקה' })], initialData)
    expect(data.lessons.some((l) => l.id === 'migo')).toBe(true)
    expect(data.entries.filter((e) => e.lessonId === 'migo')).toHaveLength(3)
    expect(data.practiceWindows).toEqual(initialData.practiceWindows)
  })

  it('המזהה של כל שיבוץ הוא המזהה מהטיוטה, כדי שלחיצה בלוח תמצא את כרטיס העריכה', () => {
    const items = [item(0, '09:00', '10:00', { name: 'מתמטיקה' }), item(0, '11:00', '12:00', { name: 'א' }, { name: 'ב' })]
    const data = draftToData(items, { ...initialData, lessons: [], entries: [] })
    expect(data.entries[0].id).toBe(items[0].id)
    expect(data.choiceGroups[0].id).toBe(items[1].id)
  })
})

describe('validateDraft', () => {
  it('מתריע על שעות הפוכות ועל שיעור בלי שם', () => {
    expect(validateDraft([item(0, '10:00', '09:00', { name: 'א' })])).toHaveLength(1)
    expect(validateDraft([item(0, '09:00', '10:00', { name: ' ' })])).toHaveLength(1)
    expect(validateDraft([])).toHaveLength(1)
  })
})
