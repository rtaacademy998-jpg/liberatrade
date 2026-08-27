/* ==========================================================================
   Libera Analysts — number, price and date formatting
   Thai body copy, English financial terms, numbers always in the mono face.
   ========================================================================== */

export const TH_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];
export const TH_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];
export const TH_DAYS = [
  'อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์',
];

/** 1,412.87 — grouped, fixed decimals, never localised digits. */
export function price(value, decimals = 2) {
  return Number(value ?? 0).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** +0.84% / −1.12% — real minus sign, never a hyphen. */
export function pct(value, decimals = 2) {
  const v = Number(value ?? 0);
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${sign}${Math.abs(v).toFixed(decimals)}%`;
}

/** +141 / −586 — signed absolute change, matching the quote's precision. */
export function signed(value, decimals = 2) {
  const v = Number(value ?? 0);
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${sign}${price(Math.abs(v), decimals)}`;
}

/**
 * Ticker-tape price: abbreviates six-figure values so a symbol like BTC reads
 * `108.9k` instead of `108,924` and the tape stays scannable at speed.
 */
export function tickerPrice(value, decimals = 2) {
  const v = Number(value ?? 0);
  if (Math.abs(v) >= 100_000) return `${(v / 1000).toFixed(1)}k`;
  return price(v, decimals);
}

/**
 * "+29.71 (+0.73%)" — the standard change readout beside a price.
 *
 * A spot quote whose previous close the feed does not supply arrives with
 * `changeKnown: false`. Show a dash: a fabricated "+0.00%" would read as a
 * flat market rather than as missing data.
 */
export function changeText(quote) {
  if (quote.changeKnown === false) return '—';
  return `${signed(quote.change, quote.decimals)} (${pct(quote.changePct)})`;
}

/** Percentage cell for tables and the tape, dashed when unknown. */
export function pctOf(quote, decimals = 2) {
  return quote.changeKnown === false ? '—' : pct(quote.changePct, decimals);
}

export function toneOf(value) {
  return value > 0 ? 'up' : value < 0 ? 'down' : '';
}

/** Tone for a quote, neutral when the change is not known. */
export function toneOfQuote(quote) {
  return quote.changeKnown === false ? '' : toneOf(quote.changePct);
}

/** "อัปเดต 12:04:31 น." — the freshness stamp in the utility bar. */
export function updatedAt(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} น.`;
}

/** $189 */
export function usd(value) {
  return `$${Number(value ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/* ----------------------------------------------------------------- dates -- */

/** วันพฤหัสบดีที่ 9 กรกฎาคม 2026 · 14:32 น. (GMT+7) */
export function longDateTime(iso) {
  const d = new Date(iso);
  const day = TH_DAYS[d.getDay()];
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `วัน${day}ที่ ${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${d.getFullYear()} · ${time} น. (GMT+7)`;
}

/** 9 ก.ค. 2026 */
export function shortDate(iso) {
  const d = new Date(iso);
  return `${d.getDate()} ${TH_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/** อ่าน 6 นาที */
export function readTime(minutes) {
  return `อ่าน ${minutes} นาที`;
}
