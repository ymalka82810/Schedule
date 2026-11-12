# מנהל לוחות זמנים (Schedule)

אתר שמציג מערכת שבועית ללימודים או לעבודה, ובהמשך ינהל גם את הזמן הפנוי.

האתר החי: https://ymalka82810.github.io/Schedule/

## מצב הפרויקט

- [x] שלב 1: לוח שבועי (RTL, צבע לכל מקצוע, מצב בהיר וכהה, תצוגת יום בטלפון)
- [ ] שלב 2: הזנת שיעורים ומשבצות בחירה
- [ ] שלב 3: אירועים חד-פעמיים
- [ ] שלב 4: יעדים גמישים ושיבוץ אוטומטי
- [ ] שלב 5: העלאת קובץ מערכת

כרגע מוצגת מערכת לדוגמה מתוך `src/data/sample.ts`.

## הרצה מקומית

```bash
npm install
npm run dev
```

## מבנה

- `src/types.ts` – מבנה הנתונים (Slot, Lesson, FixedEntry, ChoiceGroup, Goal, OneOffEvent)
- `src/data/sample.ts` – מערכת לדוגמה
- `src/lib/` – זמן ותאריכים, אחסון ב-localStorage, חישוב הבלוקים לציור
- `src/components/WeekGrid.tsx` – הלוח השבועי
- `src/index.css` – עיצוב וערכות הצבעים

כל דחיפה ל-`main` בונה ומפרסמת את האתר ל-GitHub Pages.
