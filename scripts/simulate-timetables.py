"""מייצר מערכות שעות מדומות בפורמטים שנמצאו ברשת, כ-HTML + קובץ ציפייה (JSON).
הדפסה ל-PDF נעשית אחר כך עם Chrome / LibreOffice."""
import json, os

# ההרצה: python3 scripts/simulate-timetables.py, ואז הדפסה ל-PDF:
#   google-chrome --headless --no-pdf-header-footer --print-to-pdf=X.pdf X.html
#   (control-libreoffice: soffice --headless --infilter="HTML (StarWriter)" --convert-to pdf, עם <table border="1">)
OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'lib', 'pdf', '__tests__', 'files', 'formats')
os.makedirs(OUT, exist_ok=True)

CSS = """
body{direction:rtl;font-family:'DejaVu Sans';font-size:10pt;margin:16px}
table{border-collapse:collapse;width:100%}
td,th{border:1px solid #000;padding:4px;vertical-align:top;text-align:center}
h1{font-size:14pt}
"""

def m(t):
    h, mm = t.split(':')
    return int(h) * 60 + int(mm)

def page(title, body, ltr=False, extra=''):
    d = 'ltr' if ltr else 'rtl'
    return f"<!doctype html><html dir='{d}'><head><meta charset='utf-8'><style>{CSS}{extra}" \
           f"body{{direction:{d}}}</style></head><body><h1>{title}</h1>{body}</body></html>"

def save(name, html, lessons, note):
    with open(os.path.join(OUT, name + '.html'), 'w') as f:
        f.write(html)
    with open(os.path.join(OUT, name + '.json'), 'w') as f:
        json.dump({'note': note, 'lessons': lessons}, f, ensure_ascii=False, indent=1)

def merged(grid, slots):
    """grid[day][slot] = (name, teacher, room) -> שיעורים רציפים מאוחדים"""
    out = []
    for d, row in grid.items():
        prev = None
        for i, cell in enumerate(row):
            if not cell:
                prev = None
                continue
            s, e = slots[i]
            if prev and prev['name'] == cell[0] and prev['end'] == m(s):
                prev['end'] = m(e)
            else:
                prev = {'day': d, 'start': m(s), 'end': m(e), 'name': cell[0]}
                out.append(prev)
    return out

def grid_rows(grid, slots, ndays, fmt_cell):
    """מחשב rowspan לשיעורים רציפים (תא ממוזג כמו בקבצים אמיתיים)"""
    spans = {}
    for d in range(ndays):
        row = grid.get(d, [None] * len(slots))
        i = 0
        while i < len(slots):
            j = i
            if row[i]:
                while j + 1 < len(slots) and row[j + 1] == row[i] and slots[j][1] == slots[j + 1][0]:
                    j += 1
            spans[(d, i)] = j - i + 1
            for k in range(i + 1, j + 1):
                spans[(d, k)] = 0
            i = j + 1
    return spans

# ---------- נתונים משותפים לבית ספר ----------
PERIODS = [('08:00', '08:45'), ('08:45', '09:30'), ('09:45', '10:30'), ('10:30', '11:15'),
           ('11:30', '12:15'), ('12:15', '13:00'), ('13:15', '14:00')]
M = ('מתמטיקה', 'כהן', '12'); E = ('אנגלית', 'לוי', '14'); H = ('היסטוריה', 'מזרחי', '8')
T = ('תנך', 'פרץ', '12'); P = ('פיזיקה', 'ביטון', 'מעבדה'); L = ('לשון', 'אברהם', '12')
S = ('חינוך גופני', 'דהן', 'אולם'); B = ('ביולוגיה', 'שושן', 'מעבדה')
SCHOOL = {
    0: [M, M, E, T, H, L, None],
    1: [E, E, P, P, M, S, S],
    2: [T, L, M, M, B, B, None],
    3: [H, P, E, M, T, L, None],
    4: [M, M, B, E, S, None, None],
    5: [T, H, L, None, None, None, None],
}
DAY_FULL = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי']
DAY_LET = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'"]

def school_grid(name, title, day_label, time_label, cell_fmt, note, ltr=False, ndays=6):
    spans = grid_rows(SCHOOL, PERIODS, ndays, None)
    days = list(range(ndays))
    order = days if ltr else days  # dir=rtl כבר הופך את הסדר הוויזואלי
    head = '<tr><th>' + time_label + '</th>' + ''.join(f'<th>{day_label(d)}</th>' for d in order) + '</tr>'
    rows = ''
    for i, (s, e) in enumerate(PERIODS):
        rows += f'<tr><td>{time_label_cell(i, s, e, name)}</td>'
        for d in order:
            sp = spans[(d, i)]
            if sp == 0:
                continue
            c = SCHOOL[d][i]
            txt = cell_fmt(c) if c else ''
            rows += f'<td rowspan="{sp}">{txt}</td>' if sp > 1 else f'<td>{txt}</td>'
        rows += '</tr>'
    lessons = [l for l in merged(SCHOOL, PERIODS) if l['day'] < ndays]
    save(name, page(title, f'<table>{head}{rows}</table>', ltr), lessons, note)

def time_label_cell(i, s, e, name):
    if name == 'school-shahaf':
        return f'{i + 1}<br>{s}-{e}'
    if name == 'english-school':
        h1, h2 = s.lstrip('0'), e.lstrip('0')
        return f'Period {i + 1}<br>{h1} – {h2}'
    return f'{s}-{e}'

# 1. בקרה: פורמט כמו המכינה (אותיות ימים, טווח שעות, תאים ממוזגים)
school_grid('control-mechina-like', 'מערכת שעות כיתה י1 - מעודכנת נכון לתאריך 1.11.2026',
            lambda d: DAY_LET[d], 'שעה', lambda c: f'{c[0]}<br>{c[1]}<br>{c[2]}',
            'בקרה: אותו מבנה כמו קובץ המכינה שהקורא כבר מכיר')

# 2. שחף: שמות ימים מלאים, מספר שיעור + שעות באותו תא
school_grid('school-shahaf', 'מערכת שעות כיתתית - י"א 2 (שחף)',
            lambda d: DAY_FULL[d], 'שיעור', lambda c: f'{c[0]} ({c[1]})<br>חדר {c[2]}',
            'מערכת בית ספרית בסגנון שחף: "ראשון", "שני" במקום "א\'", ומספר שיעור לפני השעה')

# 3. Google Docs של בית ספר: יום + תאריך בכותרת
school_grid('school-gdocs-dates', 'מערכת שעות שבוע 12.4-17.4 תשפ"ו',
            lambda d: f'{DAY_FULL[d]}<br>{12 + d}.4', '-שעה-', lambda c: f'{c[0]} ({c[1]}) {c[2]}',
            'מסמך גוגל של בית ספר: שם יום ותאריך בכותרת כל עמודה', ndays=5)

# 4. בית ספר באנגלית: Monday..Friday, משמאל לימין, מקף ארוך
EN = {'מתמטיקה': 'Math', 'אנגלית': 'English', 'היסטוריה': 'History', 'תנך': 'Bible', 'פיזיקה': 'Physics',
      'לשון': 'Hebrew', 'חינוך גופני': 'PE', 'ביולוגיה': 'Biology'}
DAY_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
_saved = dict(SCHOOL)
school_grid('english-school', 'Class Timetable 10B - 2026/27', lambda d: DAY_EN[d], 'Time',
            lambda c: f'{EN[c[0]]}<br>Mr. {c[1]}<br>Room {c[2]}',
            'מערכת באנגלית, ימים משמאל לימין, שעות בלי אפס מוביל ומקף ארוך', ltr=True, ndays=5)
with open(os.path.join(OUT, 'english-school.json')) as f:
    j = json.load(f)
for l in j['lessons']:
    l['name'] = EN[l['name']]
j['lessons'] = [l for l in j['lessons'] if l['day'] < 5]
with open(os.path.join(OUT, 'english-school.json'), 'w') as f:
    json.dump(j, f, ensure_ascii=False, indent=1)

# 5. מערכת הפוכה: ימים בשורות, שיעורים בעמודות (הדפסה לרוחב)
spans_h = {}
rows = '<tr><th>יום</th>' + ''.join(f'<th>{s}-{e}</th>' for s, e in PERIODS) + '</tr>'
for d in range(6):
    rows += f'<tr><td>{DAY_LET[d]}</td>'
    i = 0
    while i < len(PERIODS):
        c = SCHOOL[d][i]
        j = i
        while c and j + 1 < len(PERIODS) and SCHOOL[d][j + 1] == c and PERIODS[j][1] == PERIODS[j + 1][0]:
            j += 1
        txt = f'{c[0]}<br>{c[1]}' if c else ''
        rows += f'<td colspan="{j - i + 1}">{txt}</td>' if j > i else f'<td>{txt}</td>'
        i = j + 1
    rows += '</tr>'
save('transposed-days-rows', page('מערכת שעות ישיבה תיכונית - שיעור ג', f'<table>{rows}</table>',
     extra='@page{size:A4 landscape}'), merged(SCHOOL, PERIODS),
     'ימים בשורות ושעות בעמודות (נפוץ בהדפסה לרוחב)')

# 6. אוניברסיטה (בן גוריון): "יום ראשון", שעה עגולה אחת בכל שורה, קודי קורס, תר./מע.
HOURS = [f'{h:02d}:00' for h in range(8, 19)]
SLOTS = [(HOURS[i], f'{8 + i + 1:02d}:00') for i in range(len(HOURS))]
U1 = ('מבוא להנדסת נתונים', '382.1.1101.01'); U2 = ('חדו"א 1', '201.1.9711.10')
U3 = ('תר. חדו"א 1', '201.1.9711.14'); U4 = ('אלגברה ליניארית', '201.1.9321.04')
U5 = ('מבוא למדעי המחשב בשפת פייתון', '382.1.1111.01'); U6 = ('מע. מבוא למדעי המחשב', '382.1.1111.14')
UNI = {0: [None, U1, U1, None, U5, U5, None, U4, U4, None, None],
       1: [None, None, U3, U3, U4, U4, None, U2, U2, U2, None],
       2: [U5, U5, None, None, None, U2, U2, U2, U6, U6, None],
       3: [None, U4, U4, None, U3, None, None, U5, U5, None, None]}
spans = grid_rows(UNI, SLOTS, 4, None)
head = '<tr><th>שעות</th>' + ''.join(f'<th>יום {DAY_FULL[d]}</th>' for d in range(4)) + '</tr>'
rows = ''
for i, (s, e) in enumerate(SLOTS):
    rows += f'<tr><td>{s}</td>'
    for d in range(4):
        sp = spans[(d, i)]
        if sp == 0:
            continue
        c = UNI[d][i]
        txt = f'{c[0]}<br>{c[1]}' if c else ''
        rows += f'<td rowspan="{sp}">{txt}</td>' if sp > 1 else f'<td>{txt}</td>'
    rows += '</tr>'
uni_lessons = merged({d: [(c[0], '', '') if c else None for c in r] for d, r in UNI.items()}, SLOTS)
save('university-bgu', page('הנדסת נתונים - שנה א מערכת 1 - סמסטר א תשפ"ז', f'<table>{head}{rows}</table>'),
     uni_lessons, 'אוניברסיטה: "יום ראשון", שעה אחת בכל שורה (08:00) בלי טווח, קוד קורס בתא')

# 7. רשימה (מכללה למשפטים): יום | שעות | קורס | אופן | מרצה | חדר
LIST = [(0, '08:00', '09:30', 'מבוא למיקרו כלכלה', 'תרגיל', 'ארז צח', '204'),
        (0, '09:45', '11:15', 'המערכת החשבונאית', 'תרגיל', 'יניב לוי', '204'),
        (0, '11:45', '14:00', 'המערכת החשבונאית', 'הרצאה', 'יניב לוי', 'אודיטוריום'),
        (1, '08:30', '10:00', 'משפט עסקי', 'הרצאה', 'רונית שגב', '110'),
        (1, '10:15', '13:30', 'סטטיסטיקה', 'הרצאה', 'דן אורן', '305'),
        (3, '16:00', '19:15', 'מבוא למאקרו כלכלה', 'הרצאה', 'ארז צח', '110')]
rows = '<tr><th>יום</th><th>שעות</th><th>שם הקורס</th><th>אופן הוראה</th><th>מרצה</th><th>חדר</th></tr>'
prev = None
for d, s, e, n, k, t, r in LIST:
    rows += f'<tr><td>{DAY_LET[d] if d != prev else ""}</td><td>{s}-{e}</td><td>{n}</td><td>{k}</td><td>{t}</td><td>{r}</td></tr>'
    prev = d
save('college-list', page("מערכת חשבונאות שנה א' - סמסטר א' תשפ\"ז", f'<table>{rows}</table>'),
     [{'day': d, 'start': m(s), 'end': m(e), 'name': n} for d, s, e, n, *_ in LIST],
     'מכללה: רשימת קורסים בשורות, היום כתוב רק בשורה הראשונה של כל יום')

# 8. טכניון: שורה לכל קורס, יום ושעה באותו תא ("ג' 12:30-14:30")
TECH = [('02140132', 'דרכי הוראת המתמטיקה', 'דר\' איריס זודיק', 2, '12:30', '14:30', '300', 2, '14:30', '16:30'),
        ('02140301', 'דרכי הוראת הפיזיקה 1', 'פרופ\' שולי קפון', 2, '08:30', '10:30', '105', 2, '10:30', '12:30'),
        ('02140120', 'יסודות למידה והוראה', 'פרופ\' ארי גרו', 0, '11:30', '12:30', '107', 0, '12:30', '14:30'),
        ('02160117', 'תקשורת המדע', 'פרופ\' אילת ברעם', 1, '16:30', '19:30', '309', None, None, None)]
rows = '<tr><th>קורס</th><th>מרצה</th><th>יום ושעת הרצאה</th><th>כיתה</th><th>יום ושעת תרגול</th></tr>'
tech_lessons = []
for code, n, t, d, s, e, room, d2, s2, e2 in TECH:
    tr = f'{DAY_LET[d2]} {s2}-{e2}' if d2 is not None else ''
    rows += f'<tr><td>{code} - {n}</td><td>{t}</td><td>{DAY_LET[d]} {s}-{e}</td><td>{room}</td><td>{tr}</td></tr>'
    tech_lessons.append({'day': d, 'start': m(s), 'end': m(e), 'name': n})
    if d2 is not None:
        tech_lessons.append({'day': d2, 'start': m(s2), 'end': m(e2), 'name': n})
save('technion-courses', page('מערכת שעות סמסטר חורף תשפ"ז - הפקולטה לחינוך', f'<table>{rows}</table>'),
     tech_lessons, 'טכניון: שורה לכל קורס, יום ושעה כתובים יחד בתא אחד ("ג\' 12:30-14:30")')

print('\n'.join(sorted(f for f in os.listdir(OUT) if f.endswith('.html'))))
