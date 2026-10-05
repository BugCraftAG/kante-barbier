// @ts-check
/**
 * Online-Terminbuchung.
 *
 * Aufbau: ein einziger Zustand (state) → render() zeichnet daraus die Oberfläche.
 * Eingaben ändern nur den Zustand, nie direkt das DOM. Der Zustand wird zusätzlich
 * in der URL gespiegelt (?leistung=fade&bei=lena&tag=…&zeit=…), damit man einen
 * halb ausgefüllten Termin teilen oder neu laden kann.
 *
 * Alle Eingabefelder sind echte <input type="radio">. Damit funktionieren
 * Tastatur (Pfeiltasten), Screenreader und Formular-Semantik ohne Extra-Code.
 */

import { html, mount } from "./html.js";
import { SERVICES, BARBERS, SHOP, serviceById, barberById } from "./data.js";
import { fmtTime, parseTime, fmtDateLong, fmtDateRelative, weekdayShort, viennaNow } from "./time.js";
import { buildICS } from "./ics.js";

/**
 * @typedef {import("./schedule.js").Slot} Slot
 * @typedef {ReturnType<typeof import("./schedule.js").createScheduler>} Scheduler
 * @typedef {{
 *   service: string | null, barber: string | null, date: string | null, time: number | null,
 *   name: string, phone: string, note: string,
 *   phase: "edit" | "done", error: string | null,
 *   confirmed: null | { ref: string, barberId: string, date: string, start: number, serviceId: string }
 * }} State
 */

const STORAGE_KEY = "kante.bookings.v1";

/** Liest gespeicherte Demo-Buchungen. Speicher kann fehlen oder gesperrt sein. */
function loadStored() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); } catch { return []; }
}
/** @param {unknown[]} list */
function saveStored(list) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(-20))); } catch { /* egal */ }
}

/** Kurze, gut vorlesbare Buchungsnummer ohne verwechselbare Zeichen (0/O, 1/I). */
function bookingRef() {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return "KN-" + [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

const euro = (/** @type {number} */ n) => `€ ${n}`;

/**
 * @param {{ root: HTMLElement, summary: HTMLElement, scheduler: Scheduler }} opts
 */
export function initBooking({ root, summary, scheduler }) {
  let now = viennaNow();

  // gespeicherte Buchungen aus früheren Besuchen blockieren ihre Slots
  for (const b of loadStored()) {
    if (b && b.date >= now.date) scheduler.book(b);
  }

  /** @type {State} */
  const state = {
    service: null, barber: null, date: null, time: null,
    name: "", phone: "", note: "",
    phase: "edit", error: null, confirmed: null,
  };

  /* ---------- URL <-> Zustand ---------- */

  function readURL() {
    const p = new URLSearchParams(location.search);
    const s = p.get("leistung");
    if (s && serviceById(s)) state.service = s;
    const b = p.get("bei");
    if (b && (b === "any" || barberById(b))) state.barber = b;
    const d = p.get("tag");
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) state.date = d;
    const t = p.get("zeit");
    if (t && /^\d{2}:\d{2}$/.test(t)) state.time = parseTime(t);
    sanitize();
  }

  function writeURL() {
    const p = new URLSearchParams();
    if (state.service) p.set("leistung", state.service);
    if (state.barber) p.set("bei", state.barber);
    if (state.date) p.set("tag", state.date);
    if (state.time != null) p.set("zeit", fmtTime(state.time));
    const qs = p.toString();
    history.replaceState(null, "", `${location.pathname}${qs ? "?" + qs : ""}${location.hash}`);
  }

  /** Entfernt Auswahlen, die nach einer Änderung nicht mehr gültig sind. */
  function sanitize() {
    if (state.barber && state.barber !== "any" && state.service) {
      const b = barberById(state.barber);
      if (!b || !b.skills.includes(state.service)) state.barber = null;
    }
    if (!state.service || !state.barber) { state.date = null; state.time = null; return; }
    if (state.date) {
      const day = availableDays().find((d) => d.date === state.date);
      if (!day || day.count === 0) { state.date = null; state.time = null; return; }
    }
    if (state.date && state.time != null && !currentSlots().some((s) => s.start === state.time)) state.time = null;
  }

  /* ---------- abgeleitete Werte ---------- */

  const availableDays = () =>
    state.service && state.barber ? scheduler.days(state.service, state.barber, now) : [];

  /** @returns {Slot[]} */
  const currentSlots = () =>
    state.service && state.barber && state.date ? scheduler.slots(state.date, state.service, state.barber, now) : [];

  /** Barbier, der den gewählten Slot tatsächlich übernimmt */
  function resolvedBarber() {
    if (!state.barber || state.barber !== "any") return state.barber;
    const slot = currentSlots().find((s) => s.start === state.time);
    return slot && state.date ? scheduler.assign(slot, state.date, now) : null;
  }

  /* ---------- Rendering ---------- */

  function render() {
    if (state.phase === "done" && state.confirmed) {
      mount(root, renderDone());
      renderSummary();
      return;
    }
    mount(root, html`
      ${stepService()}
      ${state.service ? stepBarber() : stepLocked(2, "Bei wem?")}
      ${state.service && state.barber ? stepDay() : stepLocked(3, "Welcher Tag?")}
      ${state.date ? stepTime() : stepLocked(4, "Uhrzeit")}
      ${state.time != null ? stepContact() : stepLocked(5, "Ihre Daten")}
    `);
    renderSummary();
  }

  const stepHead = (/** @type {number} */ n, /** @type {string} */ title, hint = "") => html`
    <legend class="step-head"><span class="step-no">0${n}</span><span class="step-title">${title}</span>${hint ? html`<span class="step-hint">${hint}</span>` : ""}</legend>`;

  const stepLocked = (/** @type {number} */ n, /** @type {string} */ title) => html`
    <fieldset class="step is-locked" disabled aria-hidden="true">${stepHead(n, title)}</fieldset>`;

  function stepService() {
    return html`
      <fieldset class="step">
        ${stepHead(1, "Leistung")}
        <div class="options options-service">
          ${SERVICES.map((s) => html`
            <label class="option">
              <input type="radio" name="service" value="${s.id}" ${state.service === s.id ? html`checked` : ""}>
              <span class="option-body">
                <span class="option-name">${s.name}</span>
                <span class="option-meta"><span>${s.duration} min</span><span>${euro(s.price)}</span></span>
              </span>
            </label>`)}
        </div>
      </fieldset>`;
  }

  function stepBarber() {
    const svc = /** @type {import("./data.js").Service} */ (serviceById(/** @type {string} */ (state.service)));
    const any = scheduler.nextAvailable(svc.id, "any", now);
    return html`
      <fieldset class="step">
        ${stepHead(2, "Bei wem?")}
        <div class="options options-barber">
          <label class="option">
            <input type="radio" name="barber" value="any" ${state.barber === "any" ? html`checked` : ""}>
            <span class="option-body">
              <span class="avatar avatar-any" aria-hidden="true">✶</span>
              <span class="option-name">Egal – wer zuerst kann</span>
              <span class="option-sub">${any ? `frühestens ${fmtDateRelative(any.date, now.date)}, ${fmtTime(any.start)}` : "derzeit ausgebucht"}</span>
            </span>
          </label>
          ${BARBERS.map((b) => {
            const can = b.skills.includes(svc.id);
            const next = can ? scheduler.nextAvailable(svc.id, b.id, now) : null;
            return html`
              <label class="option ${can ? "" : "is-unavailable"}">
                <input type="radio" name="barber" value="${b.id}" ${state.barber === b.id ? html`checked` : ""} ${can ? "" : html`disabled`}>
                <span class="option-body">
                  <span class="avatar" aria-hidden="true">${b.initials}</span>
                  <span class="option-name">${b.name.split(" ")[0]}</span>
                  <span class="option-sub">${can ? (next ? `frühestens ${fmtDateRelative(next.date, now.date)}, ${fmtTime(next.start)}` : "ausgebucht") : `bietet ${svc.name} nicht an`}</span>
                </span>
              </label>`;
          })}
        </div>
      </fieldset>`;
  }

  function stepDay() {
    const days = availableDays();
    return html`
      <fieldset class="step">
        ${stepHead(3, "Welcher Tag?", `${days.filter((d) => d.count).length} Tage mit freien Terminen`)}
        <div class="days" role="presentation">
          ${days.map((d) => {
            const [, , dd] = d.date.split("-");
            const label = !d.isOpen ? "zu" : d.count === 0 ? "voll" : `${d.count} frei`;
            return html`
              <label class="day ${d.count ? "" : "is-empty"}">
                <input type="radio" name="date" value="${d.date}" ${state.date === d.date ? html`checked` : ""} ${d.count ? "" : html`disabled`}
                       aria-label="${fmtDateLong(d.date)}, ${label}">
                <span class="day-body" aria-hidden="true">
                  <span class="day-wd">${weekdayShort(d.date)}</span>
                  <span class="day-num">${Number(dd)}</span>
                  <span class="day-count">${label}</span>
                </span>
              </label>`;
          })}
        </div>
      </fieldset>`;
  }

  function stepTime() {
    const slots = currentSlots();
    const groups = [
      { label: "Vormittag", from: 0, to: 12 * 60 },
      { label: "Nachmittag", from: 12 * 60, to: 17 * 60 },
      { label: "Abend", from: 17 * 60, to: 24 * 60 },
    ].map((g) => ({ ...g, slots: slots.filter((s) => s.start >= g.from && s.start < g.to) })).filter((g) => g.slots.length);

    return html`
      <fieldset class="step">
        ${stepHead(4, "Uhrzeit", fmtDateLong(/** @type {string} */ (state.date)))}
        ${groups.map((g) => html`
          <div class="slot-group">
            <p class="slot-group-label">${g.label}</p>
            <div class="slots">
              ${g.slots.map((s) => html`
                <label class="slot">
                  <input type="radio" name="time" value="${s.start}" ${state.time === s.start ? html`checked` : ""}>
                  <span>${fmtTime(s.start)}</span>
                </label>`)}
            </div>
          </div>`)}
      </fieldset>`;
  }

  function stepContact() {
    return html`
      <fieldset class="step">
        ${stepHead(5, "Ihre Daten")}
        <div class="fields">
          <div class="field">
            <label for="b-name">Name</label>
            <input id="b-name" name="name" autocomplete="name" required minlength="2" value="${state.name}">
          </div>
          <div class="field">
            <label for="b-phone">Handynummer <span class="muted">für die SMS-Erinnerung</span></label>
            <input id="b-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" required value="${state.phone}"
                   pattern="[\\d\\s+\\(\\)\\/\\-]{6,}" placeholder="0660 123 45 67">
          </div>
          <div class="field field-wide">
            <label for="b-note">Anmerkung <span class="muted">optional</span></label>
            <input id="b-note" name="note" value="${state.note}" placeholder="z. B. Foto vom Wunschschnitt bringe ich mit">
          </div>
        </div>
        ${state.error ? html`<p class="form-error" role="alert">${state.error}</p>` : ""}
        <div class="submit-row">
          <button class="btn btn-accent" type="submit">Termin verbindlich buchen</button>
          <p class="muted small">Stornieren bis 12 Stunden vorher kostenlos.</p>
        </div>
      </fieldset>`;
  }

  function renderDone() {
    const c = /** @type {NonNullable<State["confirmed"]>} */ (state.confirmed);
    const svc = /** @type {import("./data.js").Service} */ (serviceById(c.serviceId));
    const b = /** @type {import("./data.js").Barber} */ (barberById(c.barberId));
    return html`
      <div class="done" tabindex="-1">
        <p class="eyebrow">Buchung ${c.ref}</p>
        <h3 class="done-title">Danke, ${state.name.split(" ")[0]}. <em>Bis bald.</em></h3>
        <p class="done-text">${svc.name} bei ${b.name.split(" ")[0]} am ${fmtDateLong(c.date)} um ${fmtTime(c.start)} Uhr.</p>
        <div class="done-actions">
          <button class="btn btn-accent" type="button" data-action="ics">In den Kalender eintragen</button>
          <button class="btn btn-ghost" type="button" data-action="reset">Weiteren Termin buchen</button>
        </div>
        <p class="muted small">Demo-Seite: Es wurde nichts übertragen. Der Termin ist nur in diesem Browser als belegt gespeichert.</p>
      </div>`;
  }

  function renderSummary() {
    const svc = state.service ? serviceById(state.service) : null;
    const confirmed = state.confirmed;
    const barberId = confirmed ? confirmed.barberId : resolvedBarber();
    const barber = barberId && barberId !== "any" ? barberById(barberId) : null;
    const start = confirmed ? confirmed.start : state.time;
    const date = confirmed ? confirmed.date : state.date;
    const row = (/** @type {string} */ k, /** @type {unknown} */ v) => html`
      <div class="ticket-row"><dt>${k}</dt><dd class="${v ? "" : "is-empty"}">${v || "—"}</dd></div>`;

    mount(summary, html`
      <div class="ticket ${confirmed ? "is-confirmed" : ""}">
        <div class="ticket-top">
          <p class="ticket-brand">KANTE <span>Barbier</span></p>
          <p class="ticket-status">${confirmed ? "Bestätigt" : "Ihr Termin"}</p>
        </div>
        <dl class="ticket-rows">
          ${row("Leistung", svc?.name)}
          ${row("Bei", barber ? barber.name : state.barber === "any" ? "wer zuerst kann" : null)}
          ${row("Tag", date ? fmtDateLong(date) : null)}
          ${row("Zeit", start != null && svc ? `${fmtTime(start)} – ${fmtTime(start + svc.duration)}` : null)}
        </dl>
        <div class="ticket-perf" aria-hidden="true"></div>
        <div class="ticket-bottom">
          <div><p class="ticket-k">Dauer</p><p class="ticket-v">${svc ? `${svc.duration} min` : "—"}</p></div>
          <div><p class="ticket-k">Preis</p><p class="ticket-v ticket-price">${svc ? euro(svc.price) : "—"}</p></div>
        </div>
        ${confirmed ? html`<p class="ticket-ref">${confirmed.ref}</p>` : ""}
      </div>`);
  }

  /* ---------- Aktionen ---------- */

  /** Scrollt sanft zum nächsten offenen Schritt (nur wenn er nicht sichtbar ist). */
  function revealStep(/** @type {number} */ index) {
    const el = root.querySelectorAll(".step")[index];
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top > window.innerHeight * 0.75) {
      el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    }
  }

  /** Fokus nach dem Neu-Rendern wiederherstellen (sonst springt er an den Seitenanfang). */
  function keepFocus(/** @type {string} */ name, /** @type {string} */ value) {
    const el = root.querySelector(`input[name="${name}"][value="${CSS.escape(value)}"]`);
    if (el instanceof HTMLInputElement) el.focus({ preventScroll: true });
  }

  root.addEventListener("change", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || t.type !== "radio") return;
    state.error = null;
    if (t.name === "service") { state.service = t.value; }
    if (t.name === "barber") { state.barber = t.value; }
    if (t.name === "date") { state.date = t.value; state.time = null; }
    if (t.name === "time") { state.time = Number(t.value); }
    sanitize();
    writeURL();
    render();
    keepFocus(t.name, t.value);
    revealStep({ service: 1, barber: 2, date: 3, time: 4 }[t.name] ?? 0);
  });

  // Textfelder: Zustand mitschreiben, ohne neu zu rendern (sonst geht der Cursor verloren)
  root.addEventListener("input", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement)) return;
    if (t.name === "name") state.name = t.value;
    if (t.name === "phone") state.phone = t.value;
    if (t.name === "note") state.note = t.value;
  });

  /** @type {HTMLFormElement} */ (root.closest("form") ?? root).addEventListener("submit", (e) => {
    e.preventDefault();
    const form = /** @type {HTMLFormElement} */ (e.currentTarget);
    if (!form.reportValidity()) return;

    // Zwischen Auswahl und Absenden kann Zeit vergangen sein: Slot neu prüfen.
    now = viennaNow();
    const slot = currentSlots().find((s) => s.start === state.time);
    if (!slot || !state.service || !state.date) {
      state.time = null;
      state.error = "Dieser Termin ist inzwischen nicht mehr frei. Bitte wählen Sie eine andere Uhrzeit.";
      sanitize();
      render();
      revealStep(3);
      return;
    }
    const barberId = state.barber === "any" ? scheduler.assign(slot, state.date, now) : /** @type {string} */ (state.barber);
    const svc = /** @type {import("./data.js").Service} */ (serviceById(state.service));
    const booking = { barberId, date: state.date, start: slot.start, duration: svc.duration };
    scheduler.book(booking);
    saveStored([...loadStored(), booking]);

    state.confirmed = { ref: bookingRef(), barberId, date: state.date, start: slot.start, serviceId: svc.id };
    state.phase = "done";
    history.replaceState(null, "", `${location.pathname}${location.hash}`);
    render();
    /** @type {HTMLElement | null} */ (root.querySelector(".done"))?.focus();
  });

  root.addEventListener("click", (e) => {
    const btn = e.target instanceof Element ? e.target.closest("[data-action]") : null;
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    if (action === "reset") {
      Object.assign(state, { service: null, barber: null, date: null, time: null, note: "", phase: "edit", confirmed: null, error: null });
      render();
      /** @type {HTMLElement | null} */ (root.querySelector("input"))?.focus();
    }
    if (action === "ics" && state.confirmed) downloadICS(state.confirmed);
  });

  /** @param {NonNullable<State["confirmed"]>} c */
  function downloadICS(c) {
    const svc = /** @type {import("./data.js").Service} */ (serviceById(c.serviceId));
    const b = /** @type {import("./data.js").Barber} */ (barberById(c.barberId));
    const ics = buildICS({
      date: c.date, start: c.start, duration: svc.duration,
      summary: `${svc.name} bei ${b.name.split(" ")[0]} – KANTE`,
      description: `Buchung ${c.ref}. Absagen bis 12 Stunden vorher unter ${SHOP.phoneDisplay}.`,
      location: `KANTE Barbier, ${SHOP.street}, ${SHOP.city}`,
      organizerHost: SHOP.host, uid: `${c.ref}@${SHOP.host}`,
    });
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `kante-termin-${c.date}.ics` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ---------- öffentliche API ---------- */

  readURL();
  render();

  return {
    /** Von außen vorwählen, z. B. aus der Leistungsliste oder dem Hero. */
    preselect(/** @type {Partial<Pick<State, "service" | "barber" | "date" | "time">>} */ sel) {
      Object.assign(state, { phase: "edit", confirmed: null, error: null }, sel);
      sanitize();
      writeURL();
      render();
    },
    /** Minütlich aufrufen, damit vergangene Zeiten verschwinden. */
    tick() {
      now = viennaNow();
      if (state.phase === "edit") {
        const active = document.activeElement;
        const typing = active instanceof HTMLInputElement && root.contains(active) && active.type !== "radio";
        if (typing) return; // nicht unter den Fingern neu rendern
        sanitize();
        render();
      }
    },
  };
}
