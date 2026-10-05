// @ts-check
/**
 * Minimaler, sicherer HTML-Templating-Helfer.
 *
 * html`<p>${name}</p>` escaped jede Interpolation automatisch. Verschachtelte
 * html-Ergebnisse und Arrays davon werden unverändert eingesetzt. So kann
 * Nutzereingabe nie als Markup interpretiert werden (kein XSS), ohne dass man
 * an jeder Stelle daran denken muss.
 */

class SafeHTML {
  /** @param {string} value */
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escape = (/** @type {unknown} */ v) =>
  String(v).replace(/[&<>"']/g, (c) => ESC[/** @type {keyof typeof ESC} */ (c)]);

/** @param {unknown} v @returns {string} */
const render = (v) => {
  if (v == null || v === false) return "";
  if (v instanceof SafeHTML) return v.value;
  if (Array.isArray(v)) return v.map(render).join("");
  return escape(v);
};

/**
 * @param {TemplateStringsArray} strings
 * @param {...unknown} values
 */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return new SafeHTML(out);
}

/** Setzt gerenderten Inhalt in ein Element. @param {Element} el @param {SafeHTML} content */
export function mount(el, content) {
  el.innerHTML = content.value;
}
