// @ts-check
/**
 * Erzeugt eine iCalendar-Datei (RFC 5545) für einen Termin.
 * Funktioniert mit Apple Kalender, Google Kalender und Outlook.
 *
 * Details, die oft falsch gemacht werden:
 *  - Zeilenenden müssen CRLF sein.
 *  - Zeilen über 75 Oktette (Bytes, nicht Zeichen!) werden gefaltet.
 *  - Komma, Semikolon und Backslash in Texten werden escaped.
 *  - Die Zeitzone wird mitgeliefert (VTIMEZONE), sonst rechnet Outlook falsch.
 */

import { fmtTime } from "./time.js";

const VTIMEZONE_VIENNA = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Vienna",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

/** @param {string} s */
export const escapeText = (s) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/**
 * Faltet eine Zeile auf max. 75 Oktette (UTF-8), ohne Mehrbyte-Zeichen zu zerteilen.
 * @param {string} line
 */
export function fold(line) {
  const enc = new TextEncoder();
  const parts = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74; // Folgezeilen beginnen mit einem Leerzeichen
    if (bytes + n > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += n;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/** "2026-10-07", 870 → "20261007T143000" */
const local = (/** @type {string} */ date, /** @type {number} */ min) => `${date.replace(/-/g, "")}T${fmtTime(min).replace(":", "")}00`;

/** Date → "20261005T123000Z" */
const utcStamp = (/** @type {Date} */ d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/**
 * @param {{
 *   date: string, start: number, duration: number,
 *   summary: string, description: string, location: string,
 *   organizerHost: string, now?: Date, uid?: string
 * }} e
 * @returns {string}
 */
export function buildICS(e) {
  const now = e.now ?? new Date();
  const uid = e.uid ?? `${e.date}-${e.start}-${Math.random().toString(36).slice(2, 10)}@${e.organizerHost}`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${e.organizerHost}//Online-Termin//DE`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...VTIMEZONE_VIENNA,
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART;TZID=Europe/Vienna:${local(e.date, e.start)}`,
    `DTEND;TZID=Europe/Vienna:${local(e.date, e.start + e.duration)}`,
    `SUMMARY:${escapeText(e.summary)}`,
    `DESCRIPTION:${escapeText(e.description)}`,
    `LOCATION:${escapeText(e.location)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    "DESCRIPTION:Termin beim Barbier",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
