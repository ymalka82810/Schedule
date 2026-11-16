/**
 * זריחה, שקיעה וזווית השמש מתחת לאופק, לפי הנוסחאות של NOAA (מבוססות על Meeus).
 * מדויק לפחות מדקה באזור שלנו, ומספיק לזמני תפילה. בלי התחשבות בגובה המקום.
 */

const rad = (deg: number) => (deg * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

/** מאות יוליאניות מאז J2000, מתוך מספר ימים מ-1970-01-01 (כולל שבר יום ב-UTC) */
const centuries = (utcDay: number) => (utcDay + 2440587.5 - 2451545) / 36525

function sunPosition(t: number) {
  const meanLong = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360
  const meanAnomaly = 357.52911 + t * (35999.05029 - 0.0001537 * t)
  const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t)
  const m = rad(meanAnomaly)
  const center =
    Math.sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * m) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * m) * 0.000289
  const omega = rad(125.04 - 1934.136 * t)
  const apparentLong = meanLong + center - 0.00569 - 0.00478 * Math.sin(omega)
  const meanObliquity = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60
  const obliquity = rad(meanObliquity + 0.00256 * Math.cos(omega))
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(rad(apparentLong)))
  const y = Math.tan(obliquity / 2) ** 2
  const l0 = rad(meanLong)
  // משוואת הזמן, בדקות
  const equation =
    4 *
    deg(
      y * Math.sin(2 * l0) -
        2 * eccentricity * Math.sin(m) +
        4 * eccentricity * y * Math.sin(m) * Math.cos(2 * l0) -
        0.5 * y * y * Math.sin(4 * l0) -
        1.25 * eccentricity * eccentricity * Math.sin(2 * m),
    )
  return { declination, equation }
}

/** אופק גאומטרי, שבירת האור באטמוספרה ורדיוס השמש */
export const SUNRISE_ZENITH = 90 + 34 / 60 + 16 / 60

/**
 * מתי השמש בזווית zenith (במעלות מהזנית) בבוקר או בערב של התאריך, בדקות UTC מחצות.
 * null = השמש לא מגיעה לזווית הזו באותו יום.
 */
export function sunTimeUtc(
  utcDay: number,
  latitude: number,
  longitude: number,
  zenith: number,
  rising: boolean,
): number | null {
  const at = (minutes: number): number | null => {
    const { declination, equation } = sunPosition(centuries(utcDay + minutes / 1440))
    const lat = rad(latitude)
    const cosHour = Math.cos(rad(zenith)) / (Math.cos(lat) * Math.cos(declination)) - Math.tan(lat) * Math.tan(declination)
    if (cosHour < -1 || cosHour > 1) return null
    const hourAngle = deg(Math.acos(cosHour)) * (rising ? 1 : -1)
    return 720 - 4 * (longitude + hourAngle) - equation
  }
  // קירוב ראשון לפי צהרי היום, ועוד סיבוב לפי השעה שהתקבלה
  const first = at(720 - 4 * longitude)
  return first === null ? null : at(first)
}
