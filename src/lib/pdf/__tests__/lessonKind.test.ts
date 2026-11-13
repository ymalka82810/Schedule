import { describe, expect, it } from 'vitest'
import { detectKind, parseBlockText } from '../parseCell'
import { draftToData } from '../toSchedule'
import { initialData } from '../../../data/initial'
import { buildBlocks } from '../../layout'
import { diffSchedules } from '../../diff'
import { setActivityDays, setEntryKind, siblings } from '../../edit'
import { item } from './fixtures'
import { TEACHERS } from './fixtures'

describe('זיהוי סוג שיעור בתא', () => {
  it('המילה יוצאת מהשם ונשמרת כסוג', () => {
    expect(detectKind('פיזיקה תרגול')).toEqual({ rest: 'פיזיקה', kind: 'תרגול' })
    expect(detectKind('הרצאה מתמטיקה')).toEqual({ rest: 'מתמטיקה', kind: 'הרצאה' })
    expect(detectKind("כימיה (תרג')")).toEqual({ rest: 'כימיה', kind: 'תרגול' })
    expect(detectKind('מתמטיקה - תרגיל')).toMatchObject({ kind: 'תרגול' })
  })

  it('אות יחס אחרי הסוג שייכת לו: "מעבדה בפיזיקה" = פיזיקה', () => {
    expect(detectKind('מעבדה בפיזיקה')).toEqual({ rest: 'פיזיקה', kind: 'מעבדה' })
    expect(detectKind('תרגול למתמטיקה')).toEqual({ rest: 'מתמטיקה', kind: 'תרגול' })
  })

  it('רק מילה שלמה, ושם שהוא רק הסוג נשאר שם', () => {
    expect(detectKind('תרגולת')).toEqual({ rest: 'תרגולת' })
    expect(detectKind('תרגול')).toEqual({ rest: 'תרגול' })
    expect(detectKind('כתיבה מדעית')).toEqual({ rest: 'כתיבה מדעית' })
  })

  it('בפענוח תא: הסוג לא מפריע לזיהוי המרצה', () => {
    expect(parseBlockText('אנגלית תרגול – שרגא פרייס', TEACHERS)[0]).toMatchObject({
      name: 'אנגלית',
      teacher: 'שרגא פרייס',
      kind: 'תרגול',
    })
    expect(parseBlockText('פיזיקה הרצאה / מבוא למחשבים תרגול', TEACHERS).map((o) => [o.name, o.kind])).toEqual([
      ['פיזיקה', 'הרצאה'],
      ['מבוא למחשבים', 'תרגול'],
    ])
  })
})

describe('סוג השיעור במערכת', () => {
  const base = { ...initialData, lessons: [], entries: [], choiceGroups: [] }
  const items = [
    item(0, '09:00', '11:00', { name: 'פיזיקה', kind: 'הרצאה' }),
    item(2, '09:00', '11:00', { name: 'פיזיקה', kind: 'תרגול' }),
    item(3, '09:00', '10:00', { name: 'כימיה', kind: 'מעבדה' }, { name: 'ביולוגיה' }),
  ]
  const data = draftToData(items, base)

  it('הרצאה ותרגול של אותו מקצוע = שיעור אחד, שני שיבוצים עם סוג', () => {
    expect(data.lessons).toHaveLength(3)
    expect(data.entries.map((e) => e.kind)).toEqual(['הרצאה', 'תרגול'])
    const g = data.choiceGroups[0]
    const chem = data.lessons.find((l) => l.name === 'כימיה')!
    expect(g.kinds).toEqual({ [chem.id]: 'מעבדה' })
    const blocks = buildBlocks(data)
    expect(blocks.find((b) => b.name === 'כימיה')?.kind).toBe('מעבדה')
    expect(blocks.find((b) => b.name === 'ביולוגיה')?.kind).toBeUndefined()
  })

  it('הרצאה ותרגול באותן שעות בימים שונים הם לא אותה פעילות', () => {
    expect(siblings(data, data.entries[0].id)).toHaveLength(1)
    const next = setActivityDays(data, data.entries[0].id, [0, 4], 9 * 60, 11 * 60)
    expect(next.entries.filter((e) => e.kind === 'הרצאה').map((e) => e.slot.day)).toEqual([0, 4])
    expect(next.entries.filter((e) => e.kind === 'תרגול')).toHaveLength(1)
  })

  it('שינוי סוג בגרסה חדשה מופיע כשינוי', () => {
    const changed = setEntryKind(data, [data.entries[1].id], 'מעבדה')
    const changes = diffSchedules(data, changed)
    expect(changes).toHaveLength(1)
    expect(changes[0].kind).toBe('changed')
    expect(setEntryKind(data, [data.entries[1].id], '').entries[1].kind).toBeUndefined()
  })
})
