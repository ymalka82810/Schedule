# מנהל לוחות זמנים (Schedule)

אתר שמציג מערכת שבועית ללימודים או לעבודה, ובהמשך ינהל גם את הזמן הפנוי.

האתר החי: https://ymalka82810.github.io/Schedule/

## מצב הפרויקט

- [x] שלב 1: לוח שבועי (RTL, צבע לכל מקצוע, מצב בהיר וכהה, תצוגת יום בטלפון)
- [ ] שלב 2: הזנת שיעורים ומשבצות בחירה
- [ ] שלב 3: אירועים חד-פעמיים
- [ ] שלב 4: יעדים גמישים ושיבוץ אוטומטי
- [ ] שלב 5: העלאת קובץ מערכת (התחלנו: קריאת PDF עם טבלה ושכבת טקסט, מסך בדיקה ועריכה בסיסית. נשארו אשף "מי אני", OCR ועדכון גרסה)

מוצגת המערכת של המכינה להנדסה ומחשבים, מתוך `src/data/initial.ts`.

הרעיונות להמשך, ובמיוחד קריאת מערכת מקובץ PDF: [WISHLIST.md](WISHLIST.md)

## הרצה מקומית

```bash
npm install
npm run dev
```

## מבנה

- `src/types.ts` – מבנה הנתונים (Slot, Lesson, FixedEntry, ChoiceGroup, Goal, OneOffEvent)
- `src/data/initial.ts` – המערכת ההתחלתית
- `src/lib/` – זמן ותאריכים, אחסון ב-localStorage, חישוב הבלוקים לציור
- `src/components/WeekGrid.tsx` – הלוח השבועי
- `src/lib/pdf/` – קריאת קובץ PDF: `raw.ts` (מילים וקווים מהעמוד), `grid.ts` (טבלה ותאים ממוזגים), `parseCell.ts` ו-`parseSchedule.ts` (פענוח), `toSchedule.ts` (טיוטה למערכת)
- `src/components/ImportDialog.tsx` – מסך הייבוא: בחירת קובץ, טיוטה על הלוח ועריכה
- `src/index.css` – עיצוב וערכות הצבעים

כל דחיפה ל-`main` בונה ומפרסמת את האתר ל-GitHub Pages.
