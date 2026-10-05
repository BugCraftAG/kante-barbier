// @ts-check
/**
 * Terminplanung – reine Funktionen, kein DOM.
 *
 * Grundidee: Die freie Zeit eines Barbiers an einem Tag ist
 *
 *     frei = Schicht − Pausen − gebuchte Termine − Vergangenheit
 *
 * Alles wird als Liste halboffener Intervalle [start, ende) in Minuten
 * dargestellt. Aus den freien Intervallen ergeben sich die Startzeiten, an denen
 * eine Leistung der Dauer d vollständig hineinpasst (Raster: RULES.slotStep).
 *
 * Weil die Seite kein Backend hat, werden "bestehende Buchungen" deterministisch
 * aus einem Seed (Barbier + Datum) erzeugt. Dieselbe Eingabe liefert auf jedem
 * Gerät dieselbe Auslastung – das macht das Verhalten reproduzierbar und testbar.
 *
 * @typedef {import("./data.js").Interval} Interval
 * @typedef {import("./data.js").Barber} Barber
 * @typedef {import("./data.js").Service} Service
 * @typedef {import("./time.js").ISODate} ISODate
 * @typedef {{ date: ISODate, minutes: number }} Now
 * @typedef {{ start: number, barberIds: string[] }} Slot
 */

import { weekday, daysBetween, addDays } from "./time.js";

/* ------------------------------------------------------------------ */
/* Intervall-Arithmetik                                                */
/* ------------------------------------------------------------------ */

/**
 * Sortiert und verschmilzt überlappende bzw. aneinanderstoßende Intervalle.
 * @param {Interval[]} list
 * @returns {Interval[]}
 */
export function merge(list) {
  const sorted = list.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  /** @type {Interval[]} */
  const out = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/**
 * Mengen-Differenz: base \ blockers. Läuft in O((n + m) log(n + m)).
 * @param {Interval[]} base
 * @param {Interval[]} blockers
 * @returns {Interval[]}
 */
export function subtract(base, blockers) {
  const cut = merge(blockers.map(([a, b]) => [a, b]));
  /** @type {Interval[]} */
  const out = [];
  for (const [a0, b0] of merge(base.map(([a, b]) => [a, b]))) {
    let a = a0;
    for (const [c, d] of cut) {
      if (d <= a) continue;
      if (c >= b0) break;
      if (c > a) out.push([a, c]);
      a = Math.max(a, d);
      if (a >= b0) break;
    }
    if (a < b0) out.push([a, b0]);
  }
  return out;
}

/**
 * Alle Startzeiten im Raster `step`, an denen `duration` Minuten vollständig
 * in eines der freien Intervalle passen.
 * @param {Interval[]} free
 * @param {number} duration
 * @param {number} step
 * @returns {number[]}
 */
export function fitSlots(free, duration, step) {
  const out = [];
  for (const [a, b] of free) {
    for (let t = Math.ceil(a / step) * step; t + duration <= b; t += step) out.push(t);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Deterministischer Zufall                                            */
/* ------------------------------------------------------------------ */

/** FNV-1a, 32 Bit. @param {string} s */
export function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32 – kleiner, schneller PRNG mit 32-Bit-Zustand. @param {number} seed */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Grundauslastung je Wochentag (Samstag ist immer voll). */
const BASE_LOAD = { 2: 0.42, 3: 0.45, 4: 0.5, 5: 0.6, 6: 0.78 };
const TYPICAL_DURATIONS = [20, 30, 45, 45, 45, 60, 75];

/**
 * Erzeugt reproduzierbare "bestehende Buchungen" für einen Barbier an einem Tag.
 * Je weiter der Tag in der Zukunft liegt, desto leerer ist er.
 * @param {Barber} barber
 * @param {ISODate} date
 * @param {ISODate} today
 * @returns {Interval[]}
 */
export function simulatedBookings(barber, date, today) {
  const wd = weekday(date);
  const day = barber.week[wd];
  if (!day) return [];
  const ahead = Math.max(0, daysBetween(today, date));
  const load = (BASE_LOAD[/** @type {keyof typeof BASE_LOAD} */ (wd)] ?? 0.5) * Math.max(0.12, 1 - ahead * 0.055);
  const rand = mulberry32(hashString(`${barber.id}|${date}`));

  /** @type {Interval[]} */
  const booked = [];
  for (const [a, b] of subtract([day.shift], day.breaks ?? [])) {
    let t = a;
    while (t < b) {
      if (rand() < load) {
        const d = TYPICAL_DURATIONS[Math.floor(rand() * TYPICAL_DURATIONS.length)];
        if (t + d <= b) booked.push([t, t + d]);
        t += d;
      } else {
        t += 15;
      }
    }
  }
  return booked;
}

/* ------------------------------------------------------------------ */
/* Scheduler                                                           */
/* ------------------------------------------------------------------ */

/**
 * @param {{
 *   barbers: Barber[], services: Service[],
 *   rules: { slotStep: number, leadTime: number, horizonDays: number },
 *   opening: Partial<Record<number, Interval>>
 * }} config
 */
export function createScheduler({ barbers, services, rules, opening }) {
  /** Zusätzliche Buchungen aus dieser Sitzung. key = "barber|date" */
  /** @type {Map<string, Interval[]>} */
  const extra = new Map();
  /** @type {Map<string, Interval[]>} */
  const simCache = new Map();

  const service = (/** @type {string} */ id) => {
    const s = services.find((x) => x.id === id);
    if (!s) throw new Error(`Unbekannte Leistung: ${id}`);
    return s;
  };

  /** @param {string} serviceId @param {string} barberId */
  const candidates = (serviceId, barberId) =>
    barbers.filter((b) => b.skills.includes(serviceId) && (barberId === "any" || b.id === barberId));

  /** @param {Barber} b @param {ISODate} date @param {ISODate} today */
  function bookedFor(b, date, today) {
    const key = `${b.id}|${date}|${today}`;
    if (!simCache.has(key)) simCache.set(key, simulatedBookings(b, date, today));
    return [...(/** @type {Interval[]} */ (simCache.get(key))), ...(extra.get(`${b.id}|${date}`) ?? [])];
  }

  /**
   * Freie Intervalle eines Barbiers an einem Tag.
   * @param {Barber} b @param {ISODate} date @param {Now} now @param {number} [lead]
   * @returns {Interval[]}
   */
  function freeIntervals(b, date, now, lead = rules.leadTime) {
    const day = b.week[weekday(date)];
    const diff = daysBetween(now.date, date);
    if (!day || diff < 0 || diff > rules.horizonDays) return [];
    /** @type {Interval[]} */
    const blockers = [...(day.breaks ?? []), ...bookedFor(b, date, now.date)];
    if (diff === 0) blockers.push([0, now.minutes + lead]);
    return subtract([day.shift], blockers);
  }

  /**
   * Buchbare Startzeiten an einem Tag. Bei barberId "any" werden die Zeiten aller
   * passenden Barbiere vereinigt; jeder Slot nennt, wer zu dieser Zeit kann.
   * @param {ISODate} date @param {string} serviceId @param {string} barberId @param {Now} now
   * @returns {Slot[]}
   */
  function slots(date, serviceId, barberId, now) {
    const { duration } = service(serviceId);
    /** @type {Map<number, string[]>} */
    const byStart = new Map();
    for (const b of candidates(serviceId, barberId)) {
      for (const t of fitSlots(freeIntervals(b, date, now), duration, rules.slotStep)) {
        const list = byStart.get(t) ?? [];
        list.push(b.id);
        byStart.set(t, list);
      }
    }
    return [...byStart.entries()].sort((x, y) => x[0] - y[0]).map(([start, barberIds]) => ({ start, barberIds }));
  }

  /**
   * Wählt bei "egal wer" den Barbier mit der geringsten Auslastung an diesem Tag
   * (Lastverteilung); bei Gleichstand gewinnt die Reihenfolge im Team.
   * @param {Slot} slot @param {ISODate} date @param {Now} now
   */
  function assign(slot, date, now) {
    const load = (/** @type {string} */ id) =>
      bookedFor(/** @type {Barber} */ (barbers.find((b) => b.id === id)), date, now.date)
        .reduce((sum, [a, b]) => sum + (b - a), 0);
    return [...slot.barberIds].sort((x, y) => load(x) - load(y) || barbers.findIndex((b) => b.id === x) - barbers.findIndex((b) => b.id === y))[0];
  }

  /**
   * Übersicht über die nächsten Tage (für die Datumsleiste).
   * @param {string} serviceId @param {string} barberId @param {Now} now
   */
  function days(serviceId, barberId, now) {
    return Array.from({ length: rules.horizonDays }, (_, i) => {
      const date = addDays(now.date, i);
      const isOpen = Boolean(opening[weekday(date)]);
      return { date, isOpen, count: isOpen ? slots(date, serviceId, barberId, now).length : 0 };
    });
  }

  /** Erster freier Termin ab jetzt. @param {string} serviceId @param {string} barberId @param {Now} now */
  function nextAvailable(serviceId, barberId, now) {
    for (let i = 0; i <= rules.horizonDays; i++) {
      const date = addDays(now.date, i);
      const s = slots(date, serviceId, barberId, now)[0];
      if (s) return { date, start: s.start, barberId: assign(s, date, now) };
    }
    return null;
  }

  /**
   * Schätzung für Kunden ohne Termin: Wann wird heute ein Stuhl für einen
   * Maschinenschnitt frei? (5-Minuten-Raster, 10 Minuten Anfahrt)
   * @param {Now} now
   * @returns {{ start: number, barberId: string } | null}
   */
  function walkIn(now) {
    const { duration } = service("maschine");
    let best = /** @type {{ start: number, barberId: string } | null} */ (null);
    for (const b of barbers) {
      const t = fitSlots(freeIntervals(b, now.date, now, 10), duration, 5)[0];
      if (t !== undefined && (!best || t < best.start)) best = { start: t, barberId: b.id };
    }
    return best;
  }

  /** Bucht einen Termin in dieser Sitzung (blockiert den Slot). */
  function book(/** @type {{ barberId: string, date: ISODate, start: number, duration: number }} */ { barberId, date, start, duration }) {
    const key = `${barberId}|${date}`;
    extra.set(key, [...(extra.get(key) ?? []), [start, start + duration]]);
  }

  return { freeIntervals, slots, assign, days, nextAvailable, walkIn, book, candidates };
}
