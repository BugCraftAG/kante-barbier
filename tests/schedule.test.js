// Ausführen mit:  node --test
import { test } from "node:test";
import assert from "node:assert/strict";

import { merge, subtract, fitSlots, mulberry32, hashString, simulatedBookings, createScheduler } from "../js/schedule.js";
import { BARBERS, SERVICES, RULES, OPENING } from "../js/data.js";
import { addDays, weekday, viennaNow, daysBetween } from "../js/time.js";

const make = () => createScheduler({ barbers: BARBERS, services: SERVICES, rules: RULES, opening: OPENING });
const TUESDAY = "2026-10-06";
const morning = { date: TUESDAY, minutes: 8 * 60 };

/* ---------- Intervall-Arithmetik ---------- */

test("merge verschmilzt überlappende und angrenzende Intervalle", () => {
  assert.deepEqual(merge([[5, 8], [1, 3], [3, 4], [7, 10]]), [[1, 4], [5, 10]]);
  assert.deepEqual(merge([[4, 4], [2, 1]]), [], "leere und verkehrte Intervalle fallen weg");
});

test("subtract entfernt Blocker korrekt", () => {
  assert.deepEqual(subtract([[0, 100]], [[10, 20], [50, 60]]), [[0, 10], [20, 50], [60, 100]]);
  assert.deepEqual(subtract([[0, 100]], [[-5, 5], [95, 200]]), [[5, 95]], "Blocker am Rand");
  assert.deepEqual(subtract([[0, 100]], [[0, 100]]), [], "vollständig blockiert");
  assert.deepEqual(subtract([[0, 10], [20, 30]], [[5, 25]]), [[0, 5], [25, 30]], "Blocker über eine Lücke");
  assert.deepEqual(subtract([[0, 10]], []), [[0, 10]]);
});

test("fitSlots liefert nur Startzeiten im Raster, an denen die Dauer ganz hineinpasst", () => {
  assert.deepEqual(fitSlots([[540, 600]], 45, 15), [540, 555]);
  assert.deepEqual(fitSlots([[545, 600]], 30, 15), [555, 570], "Start wird aufs Raster aufgerundet");
  assert.deepEqual(fitSlots([[540, 560]], 30, 15), [], "zu kurze Lücke");
});

/* ---------- Zufall ---------- */

test("PRNG ist deterministisch und im Bereich [0, 1)", () => {
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 1000; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
  assert.notEqual(hashString("lena|2026-10-06"), hashString("lena|2026-10-07"));
});

test("simulierte Buchungen liegen innerhalb der Schicht und nie in einer Pause", () => {
  for (const barber of BARBERS) {
    for (let i = 0; i < 60; i++) {
      const date = addDays(TUESDAY, i);
      const day = barber.week[weekday(date)];
      const booked = simulatedBookings(barber, date, TUESDAY);
      if (!day) { assert.equal(booked.length, 0); continue; }
      for (const [a, b] of booked) {
        assert.ok(a >= day.shift[0] && b <= day.shift[1], `${barber.id} ${date}: außerhalb der Schicht`);
        for (const [p, q] of day.breaks ?? []) assert.ok(b <= p || a >= q, `${barber.id} ${date}: in der Pause`);
      }
      assert.deepEqual(merge(booked).length, merge(booked).length);
    }
  }
});

/* ---------- Scheduler ---------- */

test("kein angebotener Termin überschneidet sich mit Buchungen oder Pausen (60 Tage, alle Kombinationen)", () => {
  const s = make();
  let checked = 0;
  for (let i = 0; i < RULES.horizonDays; i++) {
    const date = addDays(TUESDAY, i);
    for (const svc of SERVICES) {
      for (const barber of BARBERS) {
        if (!barber.skills.includes(svc.id)) continue;
        const day = barber.week[weekday(date)];
        const blocked = [...(day?.breaks ?? []), ...simulatedBookings(barber, date, TUESDAY)];
        for (const { start } of s.slots(date, svc.id, barber.id, morning)) {
          const end = start + svc.duration;
          assert.ok(day && start >= day.shift[0] && end <= day.shift[1]);
          assert.equal(start % RULES.slotStep, 0);
          for (const [a, b] of blocked) assert.ok(end <= a || start >= b, `${barber.id} ${date} ${start}`);
          checked++;
        }
      }
    }
  }
  assert.ok(checked > 500, `zu wenige Slots geprüft (${checked})`);
});

test("heute werden nur Zeiten nach der Vorlaufzeit angeboten", () => {
  const s = make();
  const now = { date: TUESDAY, minutes: 14 * 60 + 7 };
  for (const { start } of s.slots(TUESDAY, "schnitt", "any", now)) {
    assert.ok(start >= now.minutes + RULES.leadTime);
  }
});

test("Leistungen werden nur bei Barbieren angeboten, die sie können", () => {
  const s = make();
  for (let i = 0; i < 14; i++) {
    const date = addDays(TUESDAY, i);
    for (const slot of s.slots(date, "rasur", "any", morning)) {
      assert.deepEqual(slot.barberIds, ["murat"]);
    }
    assert.equal(s.slots(date, "fade", "jonas", morning).length, 0);
  }
});

test("'egal wer' vereinigt die Zeiten aller passenden Barbiere", () => {
  const s = make();
  const date = addDays(TUESDAY, 3);
  const union = new Set(s.slots(date, "schnitt", "any", morning).map((x) => x.start));
  for (const b of ["lena", "murat", "jonas"]) {
    for (const { start } of s.slots(date, "schnitt", b, morning)) assert.ok(union.has(start));
  }
});

test("assign wählt immer einen Barbier aus dem Slot", () => {
  const s = make();
  const date = addDays(TUESDAY, 2);
  for (const slot of s.slots(date, "schnitt", "any", morning)) {
    assert.ok(slot.barberIds.includes(s.assign(slot, date, morning)));
  }
});

test("eine Buchung blockiert genau ihren Zeitraum", () => {
  const s = make();
  const date = addDays(TUESDAY, 7);
  const before = s.slots(date, "fade", "lena", morning);
  assert.ok(before.length > 0);
  const { start } = before[0];
  s.book({ barberId: "lena", date, start, duration: 45 });
  const after = s.slots(date, "fade", "lena", morning).map((x) => x.start);
  for (const t of after) assert.ok(t + 45 <= start || t >= start + 45);
});

test("an Ruhetagen und außerhalb des Horizonts gibt es keine Termine", () => {
  const s = make();
  const monday = addDays(TUESDAY, -1);
  assert.equal(weekday(monday), 1);
  assert.equal(s.slots(addDays(TUESDAY, 6), "schnitt", "any", morning).length, 0, "Montag");
  assert.equal(s.slots(addDays(TUESDAY, 5), "schnitt", "any", morning).length, 0, "Sonntag");
  assert.equal(s.slots(addDays(TUESDAY, RULES.horizonDays + 1), "schnitt", "any", morning).length, 0);
  assert.equal(s.slots(addDays(TUESDAY, -1), "schnitt", "any", morning).length, 0, "Vergangenheit");
});

test("nextAvailable findet den frühesten Termin", () => {
  const s = make();
  const next = s.nextAvailable("schnitt", "any", morning);
  assert.ok(next);
  const first = s.slots(next.date, "schnitt", "any", morning)[0];
  assert.equal(first.start, next.start);
  for (let i = 0; i < daysBetween(TUESDAY, next.date); i++) {
    assert.equal(s.slots(addDays(TUESDAY, i), "schnitt", "any", morning).length, 0);
  }
});

/* ---------- Zeit ---------- */

test("viennaNow berücksichtigt Sommer- und Winterzeit", () => {
  assert.deepEqual(viennaNow(new Date("2026-07-01T10:00:00Z")), { date: "2026-07-01", minutes: 12 * 60 });
  assert.deepEqual(viennaNow(new Date("2026-12-01T10:00:00Z")), { date: "2026-12-01", minutes: 11 * 60 });
  assert.deepEqual(viennaNow(new Date("2026-12-31T23:30:00Z")), { date: "2027-01-01", minutes: 30 }, "Datumswechsel");
});

test("addDays rechnet über Monats- und Zeitumstellungsgrenzen", () => {
  assert.equal(addDays("2026-10-24", 2), "2026-10-26");
  assert.equal(addDays("2026-03-28", 1), "2026-03-29");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(daysBetween("2026-10-01", "2026-11-01"), 31);
});
