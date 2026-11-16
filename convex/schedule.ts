import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import { requireOwner } from './owner'

/** המערכת של הבעלים, או null אם עוד לא נשמרה. רק הבעלים מקבל תשובה */
export const get = queryGeneric({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireOwner(ctx)
    const row = await ctx.db
      .query('schedules')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique()
    return row ? { data: row.data, backup: row.backup ?? null, updatedAt: row.updatedAt } : null
  },
})

/**
 * שומר את המערכת (יוצר או מחליף). רק הבעלים.
 *
 * base = זמן העדכון של הגרסה שעליה השינוי מבוסס (null = לא הייתה מערכת בשרת).
 * אם בשרת יש בינתיים גרסה אחרת (נשמרה ממכשיר אחר), לא שומרים, ומחזירים conflict
 * כדי שהמכשיר ישאל איזו גרסה להשאיר. כך מכשיר עם עותק ישן לא דורס בשקט.
 * force = לשמור בכל מקרה, אחרי שהמשתמש בחר.
 *
 * בלי base (גרסה ישנה של האתר שעוד שמורה במכשיר): מתנהג כמו פעם ומחזיר רק את זמן העדכון.
 */
export const save = mutationGeneric({
  args: {
    data: v.any(),
    backup: v.any(),
    base: v.optional(v.union(v.number(), v.null())),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireOwner(ctx)
    const existing = await ctx.db
      .query('schedules')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique()
    const checked = args.base !== undefined
    if (checked && !args.force && (existing?.updatedAt ?? null) !== args.base) {
      return { ok: false as const, updatedAt: (existing?.updatedAt ?? null) as number | null }
    }
    // זמן העדכון תמיד עולה, גם אם שתי שמירות נופלות על אותה אלפית שנייה
    const updatedAt = Math.max(Date.now(), (existing?.updatedAt ?? 0) + 1)
    const doc = { data: args.data, backup: args.backup ?? null, updatedAt }
    if (existing) await ctx.db.patch(existing._id, doc)
    else await ctx.db.insert('schedules', { userId, ...doc })
    return checked ? { ok: true as const, updatedAt } : updatedAt
  },
})
