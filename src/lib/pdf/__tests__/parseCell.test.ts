import { describe, expect, it } from 'vitest'
import { normalizeSubject, parseBlockText } from '../parseCell'
import { TEACHERS } from './fixtures'

const parse = (s: string) => parseBlockText(s, TEACHERS)

describe('parseBlockText', () => {
  it('מקצוע ומרצה מוכר, עם החדר מטבלת המרצים', () => {
    expect(parse('אנגלית – שרגא פרייס')).toEqual([
      { name: 'אנגלית', teacher: 'שרגא פרייס', room: 'ויילר 243', group: undefined, from: undefined, until: undefined },
    ])
  })

  it('כמה מרצים בתא אחד = כמה קבוצות במקביל', () => {
    const out = parse('מתמטיקה שחק, קמיל, דיין')
    expect(out.map((o) => o.teacher)).toEqual(['רונן שחק', 'יוסי קמיל', 'אבי דיין'])
    expect(out.every((o) => o.name === 'מתמטיקה')).toBe(true)
  })

  it('"/" מפריד בין מגמות במקביל', () => {
    expect(parse('פיזיקה / מבוא למחשבים').map((o) => o.name)).toEqual(['פיזיקה', 'מבוא למחשבים'])
  })

  it('קבוצה ממוספרת, גם בקיצור', () => {
    expect(parse('כתיבה מדעית קבוצה 1')[0]).toMatchObject({ name: 'כתיבה מדעית', group: 'קבוצה 1' })
    expect(parse("כתיבה מדעית קב' 2")[0]).toMatchObject({ group: 'קבוצה 2' })
  })

  it('הערות זמן: "עד" ו"החל משעה"', () => {
    expect(parse('אנגלית – רמי רחמים עד 20:45')[0]).toMatchObject({ teacher: 'רמי רחמים', until: 20 * 60 + 45 })
    expect(parse('פיזיקה קסל החל משעה 13:00')[0]).toMatchObject({ teacher: 'דוד קסל', from: 13 * 60 })
  })

  it('מרצה שלא בטבלה: "מקצוע - שם"', () => {
    expect(parse('תכנות - משה כהן')[0]).toMatchObject({ name: 'תכנות', teacher: 'משה כהן' })
  })
})

describe('normalizeSubject', () => {
  it('מאחד כתיב ומנקה סימנים', () => {
    expect(normalizeSubject('"פיסיקה"')).toBe('פיזיקה')
    expect(normalizeSubject(' מתמטיקה- ')).toBe('מתמטיקה')
  })
})
