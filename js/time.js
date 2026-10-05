// @ts-check
/**
 * Zeit-Hilfsfunktionen.
 *
 * Alle Termine leben in der Zeitzone Europe/Vienna. Damit nichts von der Zeitzone
 * des Browsers abhängt, rechnen wir mit "Kalenderdaten" (ISO-String YYYY-MM-DD)
 * und Minuten ab Mitternacht – nie mit lokalen Date-Objekten.
 *
 * @typedef {string} ISODate   z. B. "2026-10-07"
 * @typedef {number} Minutes   Minuten ab 00:00, z. B. 870 = 14:30
 */

export const TZ = "Europe/Vienna";

/**
 * Aktuelles Datum und Uhrzeit in Wien.
 * @param {Date} [at] Zeitpunkt (für Tests injizierbar)
 * @returns {{ date: ISODate, minutes: Minutes }}
 */
export function viennaNow(at = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(at);
  /** @param {string} t */
  const get = (t) => /** @type {Intl.DateTimeFormatPart} */ (parts.find((p) => p.type === t)).value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

/** @param {ISODate} date @returns {number} UTC-Mitternacht in ms */
const toUTC = (date) => {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

/** @param {ISODate} date @param {number} n @returns {ISODate} */
export function addDays(date, n) {
  return new Date(toUTC(date) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Wochentag, 0 = Sonntag … 6 = Samstag. @param {ISODate} date */
export function weekday(date) {
  return new Date(toUTC(date)).getUTCDay();
}

/** Differenz in Tagen (b − a). @param {ISODate} a @param {ISODate} b */
export function daysBetween(a, b) {
  return Math.round((toUTC(b) - toUTC(a)) / 86_400_000);
}

/** 870 → "14:30" @param {Minutes} m */
export function fmtTime(m) {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** "14:30" → 870 @param {string} hhmm */
export function parseTime(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

const WD_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const WD_LONG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const MONTHS = ["Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

/** @param {ISODate} date */
export const weekdayShort = (date) => WD_SHORT[weekday(date)];
/** @param {number} wd */
export const weekdayLong = (wd) => WD_LONG[wd];

/** "Mittwoch, 7. Oktober" @param {ISODate} date */
export function fmtDateLong(date) {
  const [, m, d] = date.split("-").map(Number);
  return `${WD_LONG[weekday(date)]}, ${d}. ${MONTHS[m - 1]}`;
}

/** "heute" / "morgen" / "Mi, 7.10." @param {ISODate} date @param {ISODate} today */
export function fmtDateRelative(date, today) {
  const diff = daysBetween(today, date);
  if (diff === 0) return "heute";
  if (diff === 1) return "morgen";
  const [, m, d] = date.split("-").map(Number);
  return `${WD_SHORT[weekday(date)]}, ${d}.${m}.`;
}
