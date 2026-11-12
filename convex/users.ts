import { getAuthUserId } from '@convex-dev/auth/server'
import { queryGeneric } from 'convex/server'
import { ownerEmail } from './owner'

/** מי מחובר עכשיו, והאם זה המייל המורשה. null = לא מחובר */
export const me = queryGeneric({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return null
    const user = (await ctx.db.get(userId)) as { email?: string } | null
    const email = user?.email ?? null
    return { email, isOwner: !!email && email.toLowerCase() === ownerEmail() }
  },
})
