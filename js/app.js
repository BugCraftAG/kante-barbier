// @ts-check
/**
 * Einstiegspunkt. Verdrahtet Daten, Terminplanung und Oberfläche.
 * Jede Funktion hier rendert genau einen Bereich der Seite aus data.js –
 * Preise, Team und Öffnungszeiten stehen nirgends doppelt.
 */

import { SERVICES, BARBERS, OPENING, RULES, SHOP, barberById } from "./data.js";
import { createScheduler } from "./schedule.js";
import { viennaNow, fmtTime, fmtDateRelative, weekdayLong, weekday } from "./time.js";
import { html, mount } from "./html.js";
import { initBooking } from "./booking.js";
import { initFade } from "./fade.js";

const $ = (/** @type {string} */ sel) => /** @type {HTMLElement} */ (document.querySelector(sel));

const scheduler = createScheduler({ barbers: BARBERS, services: SERVICES, rules: RULES, opening: OPENING });

/* ---------- Leistungen ---------- */

function renderServices() {
  mount($("[data-services]"), html`${SERVICES.map((s, i) => html`
    <li class="service">
      <span class="service-no">${String(i + 1).padStart(2, "0")}</span>
      <div class="service-main">
        <h3 class="service-name">${s.name}</h3>
        <p class="service-detail">${s.detail}</p>
      </div>
      <span class="service-dur">${s.duration} min</span>
      <span class="service-price">€ ${s.price}</span>
      <button class="service-book" type="button" data-book-service="${s.id}" aria-label="${s.name} buchen">
        <span>Buchen</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg>
      </button>
    </li>`)}`);
}

/* ---------- Team ---------- */

function renderTeam() {
  const today = weekday(viennaNow().date);
  const order = [1, 2, 3, 4, 5, 6, 0];
  mount($("[data-team]"), html`${BARBERS.map((b) => {
    const shiftToday = b.week[today];
    return html`
    <article class="barber">
      <div class="barber-mono" aria-hidden="true">${b.initials}</div>
      <h3 class="barber-name">${b.name}</h3>
      <p class="barber-since">im Team seit ${b.since}</p>
      <p class="barber-focus">${b.focus}</p>
      <ol class="week" aria-label="Arbeitstage">
        ${order.map((d) => html`<li class="${b.week[d] ? "on" : ""} ${d === today ? "today" : ""}" title="${weekdayLong(d)}">${weekdayLong(d).slice(0, 2)}</li>`)}
      </ol>
      <p class="barber-today">${shiftToday ? `Heute da, ${fmtTime(shiftToday.shift[0])}–${fmtTime(shiftToday.shift[1])}` : "Heute nicht im Salon"}</p>
      <button class="link" type="button" data-book-barber="${b.id}">Termin bei ${b.name.split(" ")[0]} →</button>
    </article>`;
  })}`);
}

/* ---------- Öffnungszeiten ---------- */

function renderHours() {
  const wd = weekday(viennaNow().date);
  mount($("[data-hours]"), html`${[1, 2, 3, 4, 5, 6, 0].map((d) => {
    const o = OPENING[d];
    return html`<tr class="${d === wd ? "is-today" : ""}"><th scope="row">${weekdayLong(d)}</th><td>${o ? `${fmtTime(o[0])} – ${fmtTime(o[1])}` : "geschlossen"}</td></tr>`;
  })}`);
}

/* ---------- Live-Status (Header + Hero) ---------- */

function renderLive() {
  const now = viennaNow();
  const wd = weekday(now.date);
  const open = OPENING[wd];
  const isOpen = Boolean(open && now.minutes >= open[0] && now.minutes < open[1]);

  // nächste Öffnung suchen
  let nextOpen = "";
  if (!isOpen) {
    for (let i = 0; i < 8; i++) {
      const d = (wd + i) % 7;
      const o = OPENING[d];
      if (o && (i > 0 || now.minutes < o[0])) {
        nextOpen = `${i === 0 ? "heute" : i === 1 ? "morgen" : weekdayLong(d)} ab ${fmtTime(o[0])}`;
        break;
      }
    }
  }
  const status = $("[data-status]");
  status.classList.toggle("is-open", isOpen);
  status.querySelector("span:last-child").textContent = isOpen ? `Offen bis ${fmtTime(/** @type {[number, number]} */ (open)[1])}` : `Geschlossen · ${nextOpen}`;

  const next = scheduler.nextAvailable("schnitt", "any", now);
  const nextEl = $("[data-next]");
  if (next) {
    const b = barberById(next.barberId);
    nextEl.innerHTML = "";
    nextEl.append(`${fmtDateRelative(next.date, now.date)}, ${fmtTime(next.start)}`);
    nextEl.dataset.date = next.date;
    nextEl.dataset.time = String(next.start);
    $("[data-next-who]").textContent = `Haarschnitt bei ${b?.name.split(" ")[0]}`;
  }

  const walk = isOpen ? scheduler.walkIn(now) : null;
  const walkEl = $("[data-walkin]");
  const walkWho = $("[data-walkin-who]");
  if (walk) {
    const wait = walk.start - now.minutes;
    walkEl.textContent = wait <= 10 ? "sofort" : `in ca. ${Math.ceil(wait / 5) * 5} min`;
    walkWho.textContent = `Stuhl frei bei ${barberById(walk.barberId)?.name.split(" ")[0]}`;
  } else {
    walkEl.textContent = isOpen ? "heute voll" : "—";
    walkWho.textContent = isOpen ? "Bitte online buchen" : `Wir öffnen ${nextOpen}`;
  }
}

/* ---------- Navigation (Handy) ---------- */

function initNav() {
  const btn = $("[data-nav-toggle]");
  const nav = $("[data-nav]");
  const set = (/** @type {boolean} */ open) => {
    btn.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("is-open", open);
    document.body.classList.toggle("nav-open", open);
  };
  btn.addEventListener("click", () => set(btn.getAttribute("aria-expanded") !== "true"));
  nav.addEventListener("click", (e) => { if (e.target instanceof Element && e.target.closest("a")) set(false); });
  addEventListener("keydown", (e) => { if (e.key === "Escape") set(false); });
}

/* ---------- Start ---------- */

renderServices();
renderTeam();
renderHours();
renderLive();
initNav();
initFade(/** @type {HTMLCanvasElement} */ ($("[data-fade]")));

const booking = initBooking({ root: $("[data-booking]"), summary: $("[data-summary]"), scheduler });

const toBooking = () => $("#termin").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });

document.addEventListener("click", (e) => {
  const el = e.target instanceof Element ? e.target.closest("[data-book-service], [data-book-barber], [data-next]") : null;
  if (!(el instanceof HTMLElement)) return;
  if (el.dataset.bookService) booking.preselect({ service: el.dataset.bookService, barber: null });
  if (el.dataset.bookBarber) booking.preselect({ barber: el.dataset.bookBarber, service: BARBERS.find((b) => b.id === el.dataset.bookBarber)?.skills[0] ?? null });
  if (el.hasAttribute("data-next") && el.dataset.date) {
    booking.preselect({ service: "schnitt", barber: "any", date: el.dataset.date, time: Number(el.dataset.time) });
  }
  toBooking();
});

// Jede Minute: vergangene Zeiten ausblenden, Status aktualisieren
setInterval(() => { renderLive(); booking.tick(); }, 60_000);

console.info(`%c${SHOP.name}%c – Quellcode: github.com/BugCraftAG/kante-barbier`, "font-weight:700", "font-weight:400");
