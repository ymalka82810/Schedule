/**
 * באיזו סביבה האתר רץ:
 * - local: אין שרת מחובר (פיתוח מקומי או שעוד לא הוגדר Convex). הכול בזיכרון.
 * - guest: סביבת בדיקה פתוחה לכולם. הכול בזיכרון, אין חשבון. אפשר להתחבר כבעלים.
 * - owner: הבעלים, מחובר עם Google. המערכת נשמרת בשרת.
 */
export type Account =
  | { kind: 'local' }
  | { kind: 'guest'; signIn: () => void }
  | { kind: 'owner'; email: string; signOut: () => void }
