import { describe, expect, it } from 'vitest'
import { decideSync, savedAtDate, type OwnerCache } from '../offlineCache'
import { emptyData } from '../../data/empty'

const cache = (c: Partial<OwnerCache>): OwnerCache => ({
  email: 'me@x.com',
  data: emptyData,
  backup: null,
  savedAt: '2026-11-12T10:00:00.000Zab12',
  ...c,
})

describe('סנכרון אחרי עבודה בלי חיבור', () => {
  it('בלי שינויים ממתינים אין מה לשלוח', () => {
    expect(decideSync(cache({ pending: false }), 'me@x.com', 5).action).toBe('none')
    expect(decideSync(null, 'me@x.com', 5).action).toBe('none')
  })

  it('שינויים ממתינים והשרת לא השתנה: שולחים', () => {
    expect(decideSync(cache({ pending: true, serverUpdatedAt: 5 }), 'me@x.com', 5).action).toBe('upload')
  })

  it('גם השרת השתנה בינתיים: שואלים', () => {
    expect(decideSync(cache({ pending: true, serverUpdatedAt: 5 }), 'me@x.com', 9).action).toBe('conflict')
  })

  it('עותק של חשבון אחר לא נשלח', () => {
    expect(decideSync(cache({ pending: true }), 'other@x.com', 5).action).toBe('none')
  })

  it('זמן השמירה נקרא גם עם התוספת שבסוף', () => {
    expect(savedAtDate('2026-11-12T10:00:00.000Zab12').toISOString()).toBe('2026-11-12T10:00:00.000Z')
  })
})
