# התחברות עם Google רק למייל שלי, ושמירת המערכת ב-Convex

האתר פתוח לכולם ונשאר סטטי ב-GitHub Pages. יש בו שתי סביבות:

- **בלי התחברות (סביבת בדיקה):** לוח ריק, הכול נשמר רק בזיכרון של הדף ונמחק ברענון. אין חשבון ואין שרת.
- **אחרי "כניסה (בעלים)":** התחברות עם Google. רק המייל המורשה נכנס, והמערכת שלו נשמרת ב-Convex.

כל עוד `VITE_CONVEX_URL` לא מוגדר, האתר רץ רק כסביבת בדיקה, בלי כפתור כניסה.

## מהטלפון, בלי טרמינל (הדרך המומלצת)

GitHub Actions עושים את עבודת השרת. אתה רק יוצר חשבונות ומדביק ערכים בדפדפן.

1. **Convex:** ב-dashboard.convex.dev התחבר עם GitHub וצור פרויקט חדש. בפרויקט, Settings, URL & Deploy Key:
   - העתק את **Production deploy key** (Generate אם אין).
   - רשום את שתי הכתובות של הפרודקשן: `…convex.cloud` ו-`…convex.site`.
2. **Google Cloud Console** (console.cloud.google.com, במצב "אתר למחשב"):
   - APIs & Services, OAuth consent screen: סוג External, והוסף את המייל שלך כ-Test user.
   - Credentials, Create credentials, OAuth client ID, סוג Web application.
   - Authorized redirect URI: `https://<שם-הפריסה>.convex.site/api/auth/callback/google`
   - העתק את Client ID ואת Client Secret.
3. **GitHub:** בריפו, Settings, Secrets and variables, Actions.
   - לשונית **Secrets**, ארבעה סודות: `CONVEX_DEPLOY_KEY`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ALLOWED_EMAIL` (המייל שלך).
   - לשונית **Variables**: `VITE_CONVEX_URL` עם כתובת ה-`.convex.cloud`.
4. **הרצות ב-Actions** (לשונית Actions, בוחרים זרימה, Run workflow), לפי הסדר:
   1. `Convex: deploy`
   2. `Convex: setup env`
   3. `Deploy to GitHub Pages`

מפתחות ההתחברות נוצרים בהרצה 2 ונכנסים ישר ל-Convex, בלי שאתה או הצ'אט רואים אותם. אפשר להריץ את `setup env` שוב אם משנים סוד, והמפתחות הקיימים לא יוחלפו.

## מהמחשב (חלופה)

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
