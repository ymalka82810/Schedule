# התחברות עם Google רק למייל שלי (Convex)

האתר נשאר סטטי ב-GitHub Pages. ההתחברות רצה על שרת Convex, והשרת בודק שהמייל הוא המייל המורשה.
כל עוד `VITE_CONVEX_URL` לא מוגדר, האתר עובד כרגיל בלי התחברות. ההתחברות נדלקת רק אחרי שהשלבים כאן נעשו.

## 1. פרויקט Convex

```bash
npm install
npx convex dev        # התחברות עם GitHub, יצירת פרויקט. נוצר .env.local עם כתובת השרת
```

אחרי שהפונקציות עלו, אפשר לעצור (Ctrl+C).

## 2. מפתחות התחברות

```bash
node scripts/generate-auth-keys.mjs
```

מריצים את שתי הפקודות שהסקריפט מדפיס. המפתח הפרטי הוא סוד: הוא נכנס רק ל-Convex.

## 3. Google

ב-Google Cloud Console: APIs & Services, Credentials, Create credentials, OAuth client ID, סוג Web application.

- **Authorized redirect URI:** `https://<שם-הפריסה>.convex.site/api/auth/callback/google`
  (כתובת ה-`.convex.site` מופיעה בדשבורד של Convex, תחת Settings, URL & Deploy Key).

אחר כך מגדירים ב-Convex:

```bash
npx convex env set AUTH_GOOGLE_ID "<client id>"
npx convex env set AUTH_GOOGLE_SECRET "<client secret>"
npx convex env set ALLOWED_EMAIL "המייל-שלך@gmail.com"
npx convex env set SITE_URL "https://ymalka82810.github.io/Schedule"
```

## 4. פרודקשן

```bash
npx convex deploy
```

ואז את אותם ארבעה משתנים של שלב 3 ואת שני המפתחות של שלב 2 מגדירים גם לפרודקשן, עם `--prod`:
`npx convex env set --prod ALLOWED_EMAIL "..."` וכן הלאה. ב-Google מוסיפים גם את כתובת ה-`.convex.site` של הפרודקשן כ-redirect URI.

## 5. GitHub

בריפו: Settings, Secrets and variables, Actions, לשונית **Variables**, משתנה חדש:

- שם: `VITE_CONVEX_URL`
- ערך: כתובת ה-`.convex.cloud` של הפרודקשן

אחרי זה מריצים מחדש את ה-workflow (Actions, Deploy to GitHub Pages, Run workflow).

## איך זה מוגן

- בדיקת המייל רצה בשרת, בזמן ההתחברות עצמה, לפני שנוצר משתמש (`convex/auth.ts`). מי שלא המייל המורשה לא מקבל כניסה בכלל.
- כל פונקציית שרת עתידית שמחזירה נתונים צריכה להתחיל ב-`await requireOwner(ctx)` (`convex/owner.ts`).
- **חשוב:** כרגע המערכת עצמה נשמרת בדפדפן (localStorage), והאתר הסטטי נשאר נגיש לכולם. ההתחברות מסתירה את המסך אבל לא מגינה על מידע, כי אין מידע בשרת. כדי שהמערכת תהיה באמת פרטית צריך לשמור אותה ב-Convex.
