# התחברות עם Google רק למייל שלי, ושמירת המערכת ב-Convex

האתר פתוח לכולם ונשאר סטטי ב-GitHub Pages. יש בו שתי סביבות:

- **בלי התחברות (סביבת בדיקה):** לוח ריק, הכול נשמר רק בזיכרון של הדף ונמחק ברענון. אין חשבון ואין שרת.
- **אחרי "כניסה (בעלים)":** התחברות עם Google. רק המייל המורשה נכנס, והמערכת שלו נשמרת ב-Convex.

כל עוד `VITE_CONVEX_URL` לא מוגדר, האתר רץ רק כסביבת בדיקה, בלי כפתור כניסה.

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

- בדיקת המייל רצה בשרת, בזמן ההתחברות עצמה, לפני שנוצר משתמש (`convex/auth.ts`). מי שלא המייל המורשה לא נכנס, גם אם ינסה ישירות מול השרת.
- פונקציות השרת של המערכת (`convex/schedule.ts`) מתחילות ב-`requireOwner`, ולכן גם משתמש מחובר אחר לא יכול לקרוא או לשנות אותה.
- המערכת שלך נשמרת בשרת רק אחרי שנכנסת. מי שמבקר באתר בלי התחברות אף פעם לא רואה אותה, ושום דבר שהוא עושה לא נשמר.
- בכניסה הראשונה, אם עוד אין מערכת בשרת, היא מתחילה מהמערכת האישית שכתובה ב-`src/data/initial.ts` ונשמרת.
