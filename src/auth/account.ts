/**
 * באיזו סביבה האתר רץ:
 * - local: אין שרת מחובר (פיתוח מקומי או שעוד לא הוגדר Convex). הכול בזיכרון.
 * - guest: סביבת בדיקה פתוחה לכולם. הכול בזיכרון, אין חשבון. אפשר להיכנס כבעלים עם קוד למייל.
 * - owner: הבעלים, מחובר. המערכת נשמרת בשרת.
 * - offline: הבעלים בלי חיבור לשרת. מוצג העותק האחרון שנשמר במכשיר, לקריאה בלבד.
 */
export type Account =
  | { kind: 'local' }
  | {
      kind: 'guest'
      /** שולח קוד כניסה למייל. זורק שגיאה אם לא הצליח */
      sendCode: (email: string) => Promise<void>
      /** מאמת את הקוד. true אם נכנסנו */
      verifyCode: (email: string, code: string) => Promise<boolean>
    }
  | { kind: 'owner'; email: string; signOut: () => void }
  | { kind: 'offline'; email: string; savedAt: string }
