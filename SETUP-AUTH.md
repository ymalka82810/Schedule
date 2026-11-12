# כניסה עם קוד למייל (Resend) רק לבעלים, ושמירת המערכת ב-Convex

האתר פתוח לכולם ונשאר סטטי ב-GitHub Pages. יש בו שתי סביבות:

- **בלי כניסה (סביבת בדיקה):** לוח ריק, הכול נשמר רק בזיכרון של הדף ונמחק ברענון. אין חשבון ואין שרת.
- **אחרי "כניסה (בעלים)":** מקלידים את המייל, מקבלים קוד חד-פעמי, ונכנסים. רק המייל המורשה מקבל קוד, והמערכת שלו נשמרת ב-Convex.

כל עוד `VITE_CONVEX_URL` לא מוגדר, האתר רץ רק כסביבת בדיקה, בלי כפתור כניסה.

## מהטלפון, בלי טרמינל (הדרך המומלצת)

GitHub Actions עושים את עבודת השרת. אתה רק יוצר חשבונות ומדביק ערכים בדפדפן.

1. **Convex:** ב-dashboard.convex.dev התחבר עם GitHub וצור פרויקט חדש. בפרויקט, Settings, URL & Deploy Key:
   - העתק את **Production deploy key** (Generate אם אין).
   - העתק את הכתובת של הפרודקשן שמסתיימת ב-`.convex.cloud`.
2. **Resend:** ב-resend.com פתח חשבון **עם המייל שלך** (אותו מייל שיהיה המורשה), ואז API Keys, Create API Key והעתק אותו.
   - בחשבון חינמי בלי דומיין, Resend שולח מ-`onboarding@resend.dev` רק לכתובת של בעל החשבון. זה בדיוק מה שצריך כאן, אבל המייל המורשה חייב להיות המייל של חשבון Resend.
3. **GitHub:** בריפו, Settings, Secrets and variables, Actions.
   - לשונית **Secrets**, שלושה סודות: `CONVEX_DEPLOY_KEY`, `RESEND_API_KEY`, `ALLOWED_EMAIL` (המייל שלך).
   - לשונית **Variables**: `VITE_CONVEX_URL` עם כתובת ה-`.convex.cloud`.
4. **הרצות ב-Actions** (לשונית Actions, בוחרים זרימה, Run workflow), לפי הסדר:
   1. `Convex: deploy`
   2. `Convex: setup env`
   3. `Deploy to GitHub Pages`

מפתחות ההתחברות נוצרים בהרצה 2 ונכנסים ישר ל-Convex, בלי שאתה או הצ'אט רואים אותם. אפשר להריץ את `setup env` שוב אם משנים סוד, והמפתחות הקיימים לא יוחלפו.

## מהמחשב (חלופה)

```bash
npm install
npx convex dev                          # פרויקט חדש, ואז Ctrl+C
node scripts/generate-auth-keys.mjs     # מדפיס שתי פקודות: מריצים אותן
npx convex env set ALLOWED_EMAIL "המייל-שלך@gmail.com"
npx convex env set AUTH_RESEND_KEY "re_..."
npx convex deploy
```

בפרודקשן מוסיפים `--prod` לפקודות `env set`. ואז מגדירים ב-GitHub את `VITE_CONVEX_URL` ומריצים מחדש את "Deploy to GitHub Pages".

## איך זה מוגן

- הקוד נשלח **רק** למייל המורשה. הבדיקה רצה בשרת, לפני השליחה (`convex/ResendOTP.ts`), ולכן מי שמקליד מייל אחר לא מקבל כלום ולא יכול להיכנס.
- הקוד בן 8 ספרות, תקף ל-15 דקות, ו-Convex Auth מגביל ניסיונות כושלים.
- פונקציות השרת של המערכת (`convex/schedule.ts`) מתחילות ב-`requireOwner`, ולכן גם משתמש מחובר אחר לא יכול לקרוא או לשנות אותה.
- המערכת שלך נשמרת בשרת רק אחרי שנכנסת. מי שמבקר באתר בלי כניסה אף פעם לא רואה אותה, ושום דבר שהוא עושה לא נשמר.
- בכניסה הראשונה, אם עוד אין מערכת בשרת, היא מתחילה מהמערכת האישית שכתובה ב-`src/data/initial.ts` ונשמרת.
