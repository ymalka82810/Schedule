import Google from '@auth/core/providers/google'
import { convexAuth } from '@convex-dev/auth/server'

/** כתובות שמותר לחזור אליהן אחרי ההתחברות: האתר החי ופיתוח מקומי */
const ALLOWED_REDIRECTS = ['https://ymalka82810.github.io/Schedule', 'http://localhost:5173']

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Google({
      // רק המייל שמוגדר ב-ALLOWED_EMAIL (משתנה סביבה ב-Convex) נכנס.
      // הבדיקה רצה בשרת, לפני שנוצר משתמש, ולכן אי אפשר לעקוף אותה מהדפדפן.
      profile(profile) {
        const allowed = (process.env.ALLOWED_EMAIL ?? '').trim().toLowerCase()
        const email = (profile.email ?? '').toLowerCase()
        if (!allowed || email !== allowed || !profile.email_verified) {
          throw new Error('המייל הזה לא מורשה להיכנס')
        }
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          image: profile.picture,
        }
      },
    }),
  ],
  callbacks: {
    async redirect({ redirectTo }) {
      if (ALLOWED_REDIRECTS.some((base) => redirectTo === base || redirectTo.startsWith(`${base}/`))) {
        return redirectTo
      }
      throw new Error(`כתובת חזרה לא מורשית: ${redirectTo}`)
    },
  },
})
