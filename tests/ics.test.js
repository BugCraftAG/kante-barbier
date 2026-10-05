import { test } from "node:test";
import assert from "node:assert/strict";
import { buildICS, fold, escapeText } from "../js/ics.js";

const sample = () => buildICS({
  date: "2026-10-07", start: 14 * 60 + 30, duration: 45,
  summary: "Skin Fade bei Lena", description: "Termin bei KANTE; bitte 5 Minuten früher da sein, danke.",
  location: "KANTE, Musterplatz 3, 8020 Graz", organizerHost: "kante.example",
  now: new Date("2026-10-05T12:00:00Z"), uid: "test@kante.example",
});

test("ICS verwendet CRLF und endet mit CRLF", () => {
  const ics = sample();
  assert.ok(ics.endsWith("\r\n"));
  assert.ok(!/[^\r]\n/.test(ics), "kein nacktes LF");
});

test("ICS enthält Start/Ende mit Zeitzone und Zeitstempel in UTC", () => {
  const ics = sample();
  assert.match(ics, /DTSTART;TZID=Europe\/Vienna:20261007T143000\r\n/);
  assert.match(ics, /DTEND;TZID=Europe\/Vienna:20261007T151500\r\n/);
  assert.match(ics, /DTSTAMP:20261005T120000Z\r\n/);
  assert.match(ics, /BEGIN:VTIMEZONE[\s\S]*END:VTIMEZONE/);
});

test("Sonderzeichen werden escaped", () => {
  assert.equal(escapeText("a,b;c\\d\ne"), "a\\,b\\;c\\\\d\\ne");
  assert.match(sample(), /DESCRIPTION:Termin bei KANTE\\; bitte 5 Minuten früher da sein\\, danke\./);
});

test("Zeilen werden auf 75 Oktette gefaltet, ohne UTF-8-Zeichen zu zerteilen", () => {
  const long = "DESCRIPTION:" + "Grüße aus Graz – ".repeat(12);
  const folded = fold(long);
  const enc = new TextEncoder();
  for (const line of folded.split("\r\n")) assert.ok(enc.encode(line).length <= 75, line);
  assert.equal(folded.split("\r\n").map((l, i) => (i ? l.slice(1) : l)).join(""), long, "Entfalten ergibt das Original");
});
