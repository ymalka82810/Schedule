import { Email } from '@convex-dev/auth/providers/Email'
import { ownerEmail } from './owner'

/** קוד בן 8 ספרות, מקרי ובטוח קריפטוגרפית */
function randomCode(): string {
  const buf = new Uint32Array(1)
  // דוחים ערכים גבוהים כדי שהחלוקה תהיה אחידה
  do {
    crypto.getRandomValues(buf)
  } while (buf[0] >= 4_000_000_000)
  return String(buf[0] % 100_000_000).padStart(8, '0')
}

/**
 * כניסה עם קוד חד-פעמי שנשלח למייל דרך Resend.
 * הקוד נשלח רק למייל המורשה (ALLOWED_EMAIL), ולכן אף אחד אחר לא יכול להיכנס.
 * בחשבון החינמי של Resend אפשר לשלוח מ-onboarding@resend.dev רק לכתובת של בעל החשבון.
 */
export const ResendOTP = Email({
  id: 'resend-otp',
  maxAge: 60 * 15,
  normalizeIdentifier: (email) => email.trim().toLowerCase(),
  generateVerificationToken: async () => randomCode(),
  async sendVerificationRequest({ identifier: email, token }) {
    const owner = ownerEmail()
    if (!owner || email !== owner) {
      throw new Error('המייל הזה לא מורשה להיכנס')
    }
    const apiKey = process.env.AUTH_RESEND_KEY
    if (!apiKey) throw new Error('חסר AUTH_RESEND_KEY בשרת')

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'Schedule <onboarding@resend.dev>',
        to: [email],
        subject: `קוד כניסה: ${token}`,
        text: `קוד הכניסה שלך למערכת: ${token}\n\nהקוד תקף ל-15 דקות. אם לא ביקשת להיכנס, אפשר להתעלם מהמייל.`,
        html: `<div dir="rtl" style="font-family:sans-serif"><p>קוד הכניסה שלך למערכת:</p><p style="font-size:28px;font-weight:bold;letter-spacing:4px;direction:ltr">${token}</p><p>הקוד תקף ל-15 דקות. אם לא ביקשת להיכנס, אפשר להתעלם מהמייל.</p></div>`,
      }),
    })
    if (!res.ok) throw new Error(`שליחת המייל נכשלה (${res.status})`)
  },
})
