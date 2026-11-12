import { getAuthUserId } from '@convex-dev/auth/server'
import type { GenericQueryCtx } from 'convex/server'

type Ctx = Pick<GenericQueryCtx<any>, 'auth' | 'db'>

/** המייל היחיד שמורשה, מתוך משתנה הסביבה ALLOWED_EMAIL */
export const ownerEmail = () => (process.env.ALLOWED_EMAIL ?? '').trim().toLowerCase()

/**
 * שורה ראשונה בכל פונקציה שמחזירה או משנה נתונים:
 * זורקת שגיאה אם המשתמש לא מחובר או שהמייל שלו אינו המייל המורשה.
 */
export async function requireOwner(ctx: Ctx) {
  const userId = await getAuthUserId(ctx)
  if (!userId) throw new Error('נדרשת התחברות')
  const user = await ctx.db.get(userId)
  const email = String((user as { email?: string } | null)?.email ?? '').toLowerCase()
  if (!ownerEmail() || email !== ownerEmail()) throw new Error('אין הרשאה')
  return { userId, email }
}
