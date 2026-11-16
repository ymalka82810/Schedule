/**
 * שליחת שמירות לשרת, אחת אחרי השנייה, עם הגנה מדריסה בין מכשירים.
 *
 * כל שמירה נשלחת עם base: זמן העדכון של הגרסה בשרת שעליה היא מבוססת.
 * אם בשרת יש בינתיים גרסה אחרת (נשמרה ממכשיר אחר), השרת לא שומר, והתור נעצר
 * עד שמחליטים איזו גרסה להשאיר (keepMine או takeTheirs).
 *
 * השמירות נשלחות בתור ולא במקביל: שתי שמירות מהירות מאותו מכשיר היו נראות לשרת
 * כמו התנגשות, כי השנייה מבוססת על גרסה שהראשונה כבר החליפה.
 */

export type SaveResult = { ok: true; updatedAt: number } | { ok: false; updatedAt: number | null }

export interface SaverOptions<T> {
  /** שולח לשרת. force = לשמור גם אם השרת השתנה */
  send: (item: T, base: number | null, force: boolean) => Promise<SaveResult>
  /** השרת שמר. last = אין שמירה חדשה יותר שממתינה */
  onSaved: (item: T, updatedAt: number, last: boolean) => void
  /** בשרת יש גרסה אחרת. item = הגרסה העדכנית ביותר של המכשיר הזה */
  onConflict: (item: T, serverUpdatedAt: number | null) => void
  /** השליחה נכשלה (לא התנגשות). הפריט נשאר בתור ויישלח עם השמירה הבאה או ב-retry */
  onError: (error: unknown) => void
}

export class Saver<T> {
  /** זמן העדכון של הגרסה בשרת שהמכשיר מבוסס עליה. null = אין עדיין מערכת בשרת */
  base: number | null
  private readonly opts: SaverOptions<T>
  private queued: { item: T; force: boolean } | null = null
  private inflight = false
  private paused = false

  constructor(base: number | null, opts: SaverOptions<T>) {
    this.base = base
    this.opts = opts
  }

  /** יש שמירה בדרך, בתור, או התנגשות שמחכה להחלטה: אסור להחליף את הנתונים מהשרת */
  get busy(): boolean {
    return this.inflight || this.paused || this.queued !== null
  }

  /** שמירה חדשה. מחליפה שמירה שעוד מחכה בתור: רק המצב האחרון חשוב */
  push(item: T, force = false): void {
    this.queued = { item, force: force || !!this.queued?.force }
    this.pump()
  }

  /** ניסיון נוסף לשלוח את מה שבתור, אחרי כישלון */
  retry(): void {
    this.pump()
  }

  /** אחרי התנגשות: משאירים את הגרסה של המכשיר הזה, והיא מחליפה את מה שבשרת */
  keepMine(item: T, serverUpdatedAt: number | null): void {
    this.paused = false
    this.base = serverUpdatedAt
    this.push(item, true)
  }

  /** אחרי התנגשות: עוברים לגרסה שבשרת. מה שחיכה בתור נזרק */
  takeTheirs(serverUpdatedAt: number | null): void {
    this.paused = false
    this.queued = null
    this.base = serverUpdatedAt
  }

  private pump(): void {
    if (this.inflight || this.paused || !this.queued) return
    const { item, force } = this.queued
    this.queued = null
    this.inflight = true
    this.opts.send(item, this.base, force).then(
      (result) => {
        this.inflight = false
        if (result.ok) {
          this.base = result.updatedAt
          this.opts.onSaved(item, result.updatedAt, this.queued === null)
          this.pump()
          return
        }
        // עוצרים, ומוסרים את המצב העדכני ביותר של המכשיר
        this.paused = true
        const latest = this.queued?.item ?? item
        this.queued = null
        this.opts.onConflict(latest, result.updatedAt)
      },
      (error) => {
        this.inflight = false
        // שמירה חדשה יותר שהגיעה בינתיים עדיפה; אחרת הפריט חוזר לתור
        this.queued ??= { item, force }
        this.opts.onError(error)
      },
    )
  }
}
