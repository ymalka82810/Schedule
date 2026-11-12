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

/** שומר את המערכת (יוצר או מחליף). רק הבעלים. מחזיר את זמן העדכון, לסנכרון מהמכשיר */
export const save = mutationGeneric({
  args: { data: v.any(), backup: v.any() },
  handler: async (ctx, args) => {
    const { userId } = await requireOwner(ctx)
    const existing = await ctx.db
      .query('schedules')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique()
    const doc = { data: args.data, backup: args.backup ?? null, updatedAt: Date.now() }
    if (existing) await ctx.db.patch(existing._id, doc)
    else await ctx.db.insert('schedules', { userId, ...doc })
    return doc.updatedAt
  },
})
