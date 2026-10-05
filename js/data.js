// @ts-check
/**
 * Stammdaten des Salons. Alles, was ein Inhaber selbst ändern würde, steht hier –
 * Preise, Dauer, Team, Arbeitszeiten. Kein anderes Modul enthält solche Werte.
 *
 * @typedef {{ id: string, name: string, detail: string, duration: number, price: number }} Service
 * @typedef {[number, number]} Interval  halboffenes Intervall [start, ende) in Minuten
 * @typedef {{ shift: Interval, breaks?: Interval[] }} Workday
 * @typedef {{
 *   id: string, name: string, initials: string, focus: string, since: number,
 *   skills: string[], week: Partial<Record<number, Workday>>
 * }} Barber
 */

const h = (/** @type {number} */ hh, mm = 0) => hh * 60 + mm;

/** @type {Service[]} */
export const SERVICES = [
  { id: "schnitt",  name: "Haarschnitt",       detail: "Schere und Maschine, mit Waschen und Styling",          duration: 45, price: 34 },
  { id: "fade",     name: "Skin Fade",         detail: "Von null auf Länge, Kontur mit dem Messer",              duration: 45, price: 38 },
  { id: "maschine", name: "Maschinenschnitt",  detail: "Eine Länge rundum, ohne Waschen",                        duration: 20, price: 19 },
  { id: "bart",     name: "Bart",              detail: "Trimmen, Kontur mit dem Messer, Bartöl",                 duration: 30, price: 24 },
  { id: "rasur",    name: "Nassrasur",         detail: "Heißes Tuch, Rasiermesser, kalte Kompresse",             duration: 40, price: 32 },
  { id: "kombi",    name: "Schnitt & Bart",    detail: "Haarschnitt oder Fade plus komplette Bartpflege",        duration: 75, price: 56 },
  { id: "kids",     name: "Kinder bis 12",     detail: "Mit Geduld und ohne Zeitdruck",                          duration: 30, price: 22 },
];

/** Öffnungszeiten des Salons (0 = Sonntag). Fehlende Tage = geschlossen. */
/** @type {Partial<Record<number, Interval>>} */
export const OPENING = {
  2: [h(9), h(19)],
  3: [h(9), h(19)],
  4: [h(9), h(20)],
  5: [h(9), h(19)],
  6: [h(8), h(14)],
};

/** @type {Barber[]} */
export const BARBERS = [
  {
    id: "lena", name: "Lena Hofer", initials: "LH", since: 2016,
    focus: "Fades und kurze Schnitte. Hat in Wien gelernt und schneidet schneller, als man schauen kann.",
    skills: ["schnitt", "fade", "maschine", "bart", "kombi", "kids"],
    week: {
      2: { shift: [h(9), h(17)], breaks: [[h(12, 30), h(13)]] },
      3: { shift: [h(9), h(17)], breaks: [[h(12, 30), h(13)]] },
      4: { shift: [h(12), h(20)], breaks: [[h(16), h(16, 30)]] },
      5: { shift: [h(9), h(17)], breaks: [[h(12, 30), h(13)]] },
      6: { shift: [h(8), h(14)] },
    },
  },
  {
    id: "murat", name: "Murat Demir", initials: "MD", since: 2011,
    focus: "Bart und Nassrasur. Der Einzige im Team, der das Rasiermesser am Hals ansetzen darf.",
    skills: ["schnitt", "fade", "maschine", "bart", "rasur", "kombi"],
    week: {
      2: { shift: [h(11), h(19)], breaks: [[h(15), h(15, 30)]] },
      3: { shift: [h(11), h(19)], breaks: [[h(15), h(15, 30)]] },
      4: { shift: [h(9), h(17)], breaks: [[h(13), h(13, 30)]] },
      5: { shift: [h(11), h(19)], breaks: [[h(15), h(15, 30)]] },
      6: { shift: [h(8), h(14)] },
    },
  },
  {
    id: "jonas", name: "Jonas Pichler", initials: "JP", since: 2021,
    focus: "Scherenschnitte und längeres Haar. Nimmt sich Zeit für die Beratung.",
    skills: ["schnitt", "maschine", "bart", "kids"],
    week: {
      2: { shift: [h(9), h(19)], breaks: [[h(13), h(13, 45)]] },
      3: { shift: [h(9), h(19)], breaks: [[h(13), h(13, 45)]] },
      5: { shift: [h(9), h(19)], breaks: [[h(13), h(13, 45)]] },
    },
  },
];

/** Regeln für die Online-Buchung */
export const RULES = {
  slotStep: 15,        // Termine beginnen nur zur vollen Viertelstunde
  leadTime: 30,        // frühestens 30 min ab jetzt buchbar
  horizonDays: 21,     // drei Wochen im Voraus
};

export const SHOP = {
  name: "KANTE",
  street: "Musterplatz 3",
  city: "8020 Graz",
  phone: "+43 316 000 000",
  phoneDisplay: "0316 000 000",
  email: "termin@kante.example",
  host: "kante.example",
};

/** @param {string} id */
export const serviceById = (id) => SERVICES.find((s) => s.id === id);
/** @param {string} id */
export const barberById = (id) => BARBERS.find((b) => b.id === id);
