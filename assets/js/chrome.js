/* ==========================================================================
   Libera Analysts — shared page chrome
   Utility bar · masthead · nav · ticker tape · footer · mobile tab bar

   In the target framework these become server-rendered layout components so
   the markup ships in the HTML response (this is an SEO-sensitive editorial
   product). Here they are composed on the client to keep one definition.
   ========================================================================== */

import {
  session, setTier, entitlements, TIER_LABEL, api,
  initTheme, toggleTheme, isDark, startQuotePolling, refreshQuotes,
} from './store.js';
import { longDateTime, tickerPrice, pctOf, toneOfQuote, updatedAt } from './format.js';

const NAV = [
  { label: 'หน้าแรก',         href: './index.html' },
  { label: 'ตลาดโลก',         href: './index.html#markets' },
  { label: 'หุ้นรายตัว',       href: './asset.html' },
  { label: 'Forex',           href: './index.html#markets' },
  { label: 'Crypto',          href: './index.html#markets' },
  { label: 'Commodities',     href: './analysis.html?s=xauusd' },
  { label: 'บทวิเคราะห์',      href: './article.html' },
  { label: 'ปฏิทินเศรษฐกิจ',   href: './index.html#calendar' },
  { label: 'Watchlist',       href: './index.html#watchlist', accent: true },
  { label: 'สมาชิก',           href: './pricing.html', accent: true },
];

const TABS = [
  { label: 'หน้าแรก',   href: './index.html',            icon: '▤' },
  { label: 'ตลาด',      href: './index.html#markets',    icon: '◉' },
  { label: 'วิเคราะห์',  href: './analysis.html?s=xauusd', icon: '◔' },
  { label: 'Watchlist', href: './index.html#watchlist',  icon: '☆' },
  { label: 'โปรไฟล์',   href: './pricing.html',          icon: '●' },
];

const FOOTER_COLS = [
  { title: 'ข้อมูล',  links: [['ตลาดโลก', './index.html#markets'], ['ปฏิทินเศรษฐกิจ', './index.html#calendar'], ['Screener', './index.html']] },
  { title: 'เนื้อหา', links: [['บทวิเคราะห์', './article.html'], ['AI Brief', './index.html'], ['Morning Brief', './index.html']] },
  { title: 'สมาชิก',  links: [['แพ็คเกจ', './pricing.html'], ['บัญชีของฉัน', './pricing.html'], ['ติดต่อทีมงาน', './pricing.html']] },
];

/* ------------------------------------------------------------- helpers -- */

function h(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;     // always textContent
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

function icon(paths, size = 15) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', size); svg.setAttribute('height', size);
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of [].concat(paths)) {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '1.5');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(p);
  }
  return svg;
}

const MOON = 'M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.8 5.8 0 1 0 7.1 7.1z';
const SUN  = ['M8 5.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z',
              'M8 1.4v1.3M8 13.3v1.3M14.6 8h-1.3M2.7 8H1.4M12.7 3.3l-.9.9M4.2 11.8l-.9.9M12.7 12.7l-.9-.9M4.2 4.2l-.9-.9'];

/* ------------------------------------------------------- the tier chip -- */

function tierChip(tier) {
  const meta = TIER_LABEL[tier];
  const cls = meta.style === 'ink' ? 'pill pill--ink'
            : meta.style === 'accent' ? 'pill pill--accent'
            : 'pill';
  return h('span', { class: cls, text: meta.text });
}

/**
 * Membership preview switch.
 *
 * In production the tier comes from the session and is not user-selectable —
 * this control exists so the three entitlement states (4a / 6a / 6b in the
 * canvas) can be reviewed without three separate builds.
 */
function tierSwitch() {
  const sel = h('select', {
    class: 'select-tier',
    'aria-label': 'ดูตัวอย่างสิทธิ์สมาชิก (สำหรับรีวิวดีไซน์)',
    onchange: (ev) => setTier(ev.target.value),
  }, [
    h('option', { value: 'free', text: 'ดูอย่าง Free' }),
    h('option', { value: 'pro', text: 'ดูอย่าง Pro' }),
    h('option', { value: 'exclusive', text: 'ดูอย่าง Exclusive' }),
  ]);
  sel.value = session.tier;
  return sel;
}

/* --------------------------------------------------------- utility bar -- */

function utilityBar(ent, asOf) {
  const left = h('span', { class: 'mut' });

  if (ent.realtimeQuotes) {
    left.append(
      document.createTextNode(`${longDateTime(asOf).split(' · ')[0]} · `),
      h('span', { class: 'realtime', text: 'ข้อมูลเรียลไทม์' }),
    );
  } else {
    left.textContent = longDateTime(asOf);
  }

  const right = h('div', { class: 'utility__right' }, [
    freshness(asOf),
    tierChip(session.tier),
    ent.upgradeTarget
      ? h('a', {
          class: 'accent', href: './pricing.html',
          style: 'font-weight:600',
          text: ent.upgradeTarget === 'pro' ? 'อัปเกรดเป็น Pro →' : 'อัปเกรดเป็น Exclusive →',
        })
      : null,
    tierSwitch(),
    themeButton(),
    h('div', { class: 'avatar', text: session.user.initials, title: session.user.name }),
  ]);

  return h('div', { class: 'utility' }, [left, right]);
}

/**
 * Freshness stamp + manual refresh.
 *
 * Prices reload on their own every `refreshSeconds`; this shows when that
 * last happened and lets a reader force it. On a failed refresh it flips to
 * a stale note and keeps the last good prices on screen.
 */
function freshness(asOf) {
  const label = h('span', { class: 'freshness__time', text: updatedAt(asOf) });

  const btn = h('button', {
    class: 'freshness', type: 'button',
    'aria-label': 'โหลดราคาล่าสุดตอนนี้',
    title: 'อัปเดตอัตโนมัติทุก 5 นาที — กดเพื่อโหลดทันที',
  }, [
    h('span', { class: 'freshness__dot', 'aria-hidden': 'true' }),
    h('span', { class: 'mut', text: 'อัปเดต ' }),
    label,
  ]);

  btn.addEventListener('click', async () => {
    btn.dataset.busy = 'true';
    document.getElementById('main')?.classList.add('is-loading');
    await refreshQuotes();
    btn.dataset.busy = 'false';
    document.getElementById('main')?.classList.remove('is-loading');
  });

  window.addEventListener('libera:quotesupdate', (ev) => {
    btn.dataset.stale = 'false';
    label.textContent = updatedAt(ev.detail.doc.asOf);
  });
  window.addEventListener('libera:quotesstale', () => {
    btn.dataset.stale = 'true';
    btn.title = 'โหลดราคาล่าสุดไม่สำเร็จ — กำลังแสดงราคาล่าสุดที่ได้มา';
  });

  return btn;
}

function themeButton() {
  const btn = h('button', {
    class: 'icon-btn', type: 'button',
    'aria-label': isDark() ? 'สลับเป็นธีมสว่าง' : 'สลับเป็นธีมมืด',
  });
  const paint = () => {
    btn.replaceChildren(icon(isDark() ? SUN : MOON, 15));
    btn.setAttribute('aria-label', isDark() ? 'สลับเป็นธีมสว่าง' : 'สลับเป็นธีมมืด');
  };
  paint();
  btn.addEventListener('click', () => { toggleTheme(); paint(); });
  return btn;
}

/* ------------------------------------------------- masthead + main nav -- */

function masthead() {
  return h('div', { class: 'masthead' }, [
    h('a', { href: './index.html', class: 'masthead__word', 'aria-label': 'Libera Analysts หน้าแรก' }, [
      document.createTextNode('Libera '),
      h('span', { text: 'Analysts' }),
    ]),
    h('div', { class: 'masthead__sub', text: 'GLOBAL MARKETS · ANALYSIS · DATA' }),
  ]);
}

function mainNav(current) {
  const nav = h('nav', { class: 'mainnav', id: 'mainnav', 'aria-label': 'เมนูหลัก' },
    NAV.map((item) => h('a', {
      href: item.href,
      class: item.accent ? 'is-accent' : null,
      'aria-current': item.label === current ? 'page' : null,
      text: item.label,
    })));
  return nav;
}

function navToggle() {
  const btn = h('button', {
    class: 'nav-toggle', type: 'button',
    'aria-expanded': 'false', 'aria-controls': 'mainnav',
    'aria-label': 'เปิดเมนู',
  }, [icon(['M2 4h12M2 8h12M2 12h12'], 16)]);

  btn.addEventListener('click', () => {
    const nav = document.getElementById('mainnav');
    const open = nav.dataset.open === 'true';
    nav.dataset.open = String(!open);
    btn.setAttribute('aria-expanded', String(!open));
  });
  return btn;
}

/* --------------------------------------------------------- ticker tape -- */

function tickerTape(quotes, tape) {
  const bySym = new Map(quotes.map((q) => [q.symbol, q]));

  const make = () => tape.map((sym) => {
    const q = bySym.get(sym);
    if (!q) return null;
    return h('a', { class: 'ticker__item', href: `./asset.html?s=${q.symbol}` }, [
      h('span', { class: 'ticker__sym', text: q.name }),
      h('span', { class: 'ticker__last', text: tickerPrice(q.last, q.decimals), 'data-sym': q.symbol }),
      h('span', { class: toneOfQuote(q), 'data-pct': q.symbol, text: pctOf(q) }),
    ]);
  }).filter(Boolean);

  // Two identical copies so the -50% keyframe wraps seamlessly.
  const track = h('div', { class: 'ticker__track' }, [...make(), ...make()]);
  track.setAttribute('aria-hidden', 'false');

  return h('div', { class: 'ticker', 'aria-label': 'ราคาตลาดล่าสุด' }, [track]);
}

/**
 * Patch prices in place rather than rebuilding the tape — a rebuild would
 * restart the marquee and jump the reader's position. Cells whose price
 * actually moved get a brief tint that decays (skipped under reduced motion).
 */
function updateTicker(map, changed) {
  const moved = new Set(changed.map((c) => c.symbol));
  const dir = new Map(changed.map((c) => [c.symbol, c.to > c.from ? 'up' : 'down']));

  for (const cell of document.querySelectorAll('.ticker__last[data-sym]')) {
    const q = map.get(cell.dataset.sym);
    if (!q) continue;
    cell.textContent = tickerPrice(q.last, q.decimals);

    if (moved.has(q.symbol)) {
      const klass = `tick-flash tick-flash--${dir.get(q.symbol)}`;
      cell.className = `ticker__last ${klass}`;
      cell.addEventListener('animationend', () => { cell.className = 'ticker__last'; }, { once: true });
    }
  }

  for (const cell of document.querySelectorAll('.ticker__item [data-pct]')) {
    const q = map.get(cell.dataset.pct);
    if (!q) continue;
    cell.textContent = pctOf(q);
    cell.className = toneOfQuote(q);
  }
}

/* -------------------------------------------------------------- footer -- */

function footer() {
  return h('footer', { class: 'site-footer' }, [
    h('div', { class: 'site-footer__top' }, [
      h('div', { class: 'site-footer__brand' }, [
        h('span', { class: 'site-footer__word' }, [
          document.createTextNode('Libera '), h('span', { text: 'Analysts' }),
        ]),
        h('span', {
          class: 'mut', style: 'font-size:12px;line-height:1.6',
          text: 'ศูนย์รวมข้อมูลและบทวิเคราะห์ทุกสินทรัพย์ทั่วโลก — หุ้น, Forex, Crypto, Commodities',
        }),
      ]),
      h('div', { class: 'site-footer__cols' }, FOOTER_COLS.map((col) =>
        h('div', { class: 'site-footer__col' }, [
          h('span', { class: 'mut', style: 'font-size:11px', text: col.title }),
          ...col.links.map(([label, href]) => h('a', { href, text: label })),
        ]))),
    ]),
    h('div', {
      class: 'site-footer__legal',
      text: '© 2026 Libera.co · การวิเคราะห์ทั้งหมดเป็นความเห็น ไม่ใช่คำชี้ชวนการลงทุน · ข้อมูลล่าช้า 15 นาทีสำหรับสมาชิก Free',
    }),
  ]);
}

function tabBar(current) {
  return h('nav', { class: 'tabbar', 'aria-label': 'เมนูล่าง' },
    TABS.map((t) => h('a', {
      href: t.href,
      'aria-current': t.label === current ? 'page' : null,
    }, [
      h('span', { 'aria-hidden': 'true', style: 'font-size:15px', text: t.icon }),
      h('span', { text: t.label }),
    ])));
}

/* ---------------------------------------------------------------- init -- */

/**
 * Mounts the chrome into #chrome-top / #chrome-bottom and re-mounts whenever
 * the tier changes, so every entitlement-driven surface stays in agreement.
 *
 * @param {{current?: string, variant?: 'full'|'inline', navHighlight?: string}} opts
 */
export async function mountChrome(opts = {}) {
  initTheme();

  const top = document.getElementById('chrome-top');
  const bottom = document.getElementById('chrome-bottom');
  if (!top) return;

  const { quotes, tape, asOf, refreshSeconds = 300 } = await api.quotes();

  const paint = () => {
    const ent = entitlements();

    if (opts.variant === 'inline') {
      top.replaceChildren(
        utilityBar(ent, asOf),
        inlineHeader(opts.navHighlight),
      );
    } else {
      top.replaceChildren(
        utilityBar(ent, asOf),
        masthead(),
        h('div', { class: 'nav-wrap' }, [navToggle()]),
        mainNav(opts.current),
        tickerTape(quotes, tape),
      );
    }
    if (bottom) bottom.replaceChildren(footer(), tabBar(opts.current));
  };

  paint();
  window.addEventListener('libera:tierchange', paint);

  // Prices refresh on the cadence the data file asks for; the tape and the
  // freshness stamp update in place so nothing on screen jumps.
  window.addEventListener('libera:quotesupdate', (ev) => {
    updateTicker(ev.detail.map, ev.detail.changed);
  });
  startQuotePolling(refreshSeconds);

  return { repaint: paint };
}

function inlineHeader(highlight) {
  const items = ['หน้าแรก', 'ตลาดโลก', 'หุ้นรายตัว', 'Commodities', 'คำแนะนำ'];
  const hrefs = {
    'หน้าแรก': './index.html',
    'ตลาดโลก': './index.html#markets',
    'หุ้นรายตัว': './asset.html',
    'Commodities': './analysis.html?s=xauusd',
    'คำแนะนำ': './pricing.html',
  };

  return h('div', { class: 'inline-header' }, [
    h('div', { class: 'row row-24' }, [
      h('a', { href: './index.html', class: 'inline-header__word' }, [
        document.createTextNode('Libera '), h('span', { text: 'Analysts' }),
      ]),
      h('nav', { 'aria-label': 'เมนู' }, items.map((label) => h('a', {
        href: hrefs[label],
        class: label === highlight ? 'accent' : null,
        text: label,
      }))),
    ]),
    h('div', {
      class: 'mut',
      style: 'border:1px solid var(--border);border-radius:var(--radius);padding:7px 14px;width:220px;font-size:12.5px;background:var(--surface)',
      text: '🔍 ค้นหาสินทรัพย์…',
    }),
  ]);
}

export { h, icon };
