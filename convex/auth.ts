import { convexAuth } from '@convex-dev/auth/server'
import { ResendOTP } from './ResendOTP'

// כניסה רק עם קוד חד-פעמי למייל המורשה. בדיקת המייל נעשית בשרת, לפני שליחת הקוד (ResendOTP.ts)
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [ResendOTP],
})
