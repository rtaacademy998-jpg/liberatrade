/* ==========================================================================
   Libera Analysts — homepage (canvas option 4a, with the 6a / 6b states)
   ========================================================================== */

import { api, entitlements, quoteMap, tierBadgeText } from './store.js';
import { mountChrome, h } from './chrome.js';
import { price, pctOf, toneOf, toneOfQuote, usd } from './format.js';
import { sparkline } from './charts.js';

const MARKET_GROUPS = [
  { title: 'ดัชนีหุ้น',   symbols: ['SPX', 'NDX', 'US30', 'NIKKEI'] },
  { title: 'Forex',      symbols: ['EURUSD', 'USDJPY', 'GBPUSD', 'USDTHB'] },
  { title: 'Crypto',     symbols: ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD'] },
  { title: 'Commodities',symbols: ['XAUUSD', 'WTI', 'XAGUSD', 'COPPER'] },
];

const TODAY_ROWS = ['SPX', 'NDX', 'XAUUSD', 'WTI', 'USDTHB', 'BTCUSD'];

let data = null;

async function boot() {
  await mountChrome({ current: 'หน้าแรก' });

  const [articles, desk, quotes] = await Promise.all([
    api.articles(), api.desk(), quoteMap(),
  ]);
  data = { articles, desk, quotes };

  render();
  window.addEventListener('libera:tierchange', render);

  // New prices arrive every few minutes — swap the map and redraw.
  window.addEventListener('libera:quotesupdate', (ev) => {
    data.quotes = ev.detail.map;
    render();
  });
}

function render() {
  const ent = entitlements();
  renderMain(ent);
  renderSide(ent);
}

/* ----------------------------------------------------------- main column -- */

function renderMain(ent) {
  const { articles, quotes } = data;
  const lead = articles.articles.find((a) => a.lead);
  const author = articles.authors[lead.author];
  const rest = articles.articles.filter((a) => !a.lead).slice(0, 3);

  const main = document.getElementById('home-main');
  main.replaceChildren(

    /* --- lead story --- */
    h('article', {}, [
      h('div', { class: 'kicker', text: lead.kicker }),
      h('h1', { class: 'lead__headline' }, [
        h('a', { href: `./article.html?a=${lead.slug}`, text: lead.headline }),
      ]),
      h('p', { class: 'lead__byline', text: `โดย ${author.name} — ${author.role} · อ่าน ${lead.readMinutes} นาที` }),
      h('div', { class: 'ph lead__media', text: 'ภาพประกอบ / กราฟหลัก (แนบไฟล์จริงภายหลัง)' }),
      h('p', { class: 'standfirst', style: 'margin-top:16px', text: lead.standfirst }),
    ]),

    h('div', { class: 'rule', style: 'margin-top:24px;padding-top:18px' }),

    /* --- latest analysis --- */
    h('div', { class: 'section-head-row' }, [
      h('h2', { class: 'section-head', text: 'บทวิเคราะห์ล่าสุด · LATEST ANALYSIS' }),
      h('a', { href: './article.html', style: 'font-size:12px;font-weight:600', text: 'ดูทั้งหมด →' }),
    ]),
    h('div', { class: 'cardgrid' }, rest.map((a) => analysisCard(a, articles.authors[a.author], ent))),

    h('div', { class: 'rule', style: 'margin-top:24px;padding-top:18px' }),

    /* --- global markets --- */
    h('h2', {
      class: 'section-head', id: 'markets',
      style: 'border-bottom:0;padding-bottom:0;margin-bottom:10px',
      text: 'ตลาดทั่วโลก · GLOBAL MARKETS',
    }),
    h('div', { class: 'markets-grid' }, MARKET_GROUPS.map((g) => marketGroup(g, quotes))),
  );
}

function analysisCard(article, author, ent) {
  const readable = ent.canRead(article.requiredTier);
  const badge = tierBadgeText(article.requiredTier);

  // Tier mark rides the kicker: FREE plain, readable tiers get ✓, locked get 🔒.
  const kickerText = article.requiredTier === 'free'
    ? `${article.assetLabel} · FREE`
    : readable
      ? `${article.assetLabel} · ${badge} ✓ อ่านได้`
      : `${article.assetLabel} · ${badge} 🔒`;

  const href = readable
    ? `./article.html?a=${article.slug}`
    : `./paywall.html?a=${article.slug}`;

  return h('a', { class: 'acard', href }, [
    h('div', { class: 'ph acard__media', text: 'ภาพ' }),
    h('span', {
      class: article.requiredTier === 'free' || readable ? 'kicker kicker--mut' : 'kicker',
      text: kickerText,
    }),
    h('span', { class: 'acard__headline', text: article.headline }),
    h('span', { class: 'acard__meta', text: `${author.name} · ${article.displayTime}` }),
  ]);
}

function marketGroup(group, quotes) {
  return h('div', {}, [
    h('div', { class: 'markets-grid__head', text: group.title }),
    ...group.symbols.map((sym) => {
      const q = quotes.get(sym);
      if (!q) return null;
      return h('a', { class: 'srow', href: `./asset.html?s=${sym}` }, [
        h('span', { style: 'font-size:12px', text: q.name }),
        h('span', { class: `num ${toneOfQuote(q)}`, style: 'font-size:12px', text: pctOf(q) }),
      ]);
    }).filter(Boolean),
  ]);
}

/* -------------------------------------------------------------- sidebar -- */

function renderSide(ent) {
  const { desk, quotes } = data;
  const side = document.getElementById('home-side');

  side.replaceChildren(
    todayBox(quotes),
    aiBriefBox(desk.aiBrief),
    watchlistBox(desk, quotes, ent),
    callsBox(desk, ent),
    ...(ent.realtimeAlerts ? [alertsBox(desk, ent)] : []),
    ...(ent.modelPortfolio ? [portfolioBox(desk), liveQABox(desk.liveQA)] : []),
    calendarBox(desk.calendar),
  );
}

function boxed(title, children, { accent = false, id = null } = {}) {
  return h('section', { id }, [
    h('h2', { class: `section-head${accent ? ' section-head--accent' : ''}`, text: title }),
    ...[].concat(children),
  ]);
}

function todayBox(quotes) {
  return boxed('ตลาดวันนี้ · MARKETS', TODAY_ROWS.map((sym) => {
    const q = quotes.get(sym);
    if (!q) return null;

    // Fixed 64x20 viewBox — no layout measurement needed, so draw it now
    // rather than on a frame callback (which never fires in a hidden tab).
    const sparkHost = h('span', { class: 'spark-host', style: 'display:flex' });
    sparkline(sparkHost, q.spark, toneOfQuote(q) || 'up');

    return h('a', { class: 'srow', href: `./asset.html?s=${sym}` }, [
      h('span', { text: q.name }),
      h('span', { class: 'srow__vals' }, [
        sparkHost,
        h('span', { class: 'num', style: 'font-weight:600', text: price(q.last, q.decimals) }),
        h('span', { class: `num ${toneOfQuote(q)}`, text: pctOf(q) }),
      ]),
    ]);
  }).filter(Boolean));
}

function aiBriefBox(brief) {
  return boxed(brief.kicker, [
    h('p', { style: 'font-size:13.5px;line-height:1.75;margin:10px 0', text: brief.text }),
    h('a', { class: 'accent', href: './index.html', style: 'font-size:12px;font-weight:600', text: brief.cta }),
  ], { accent: true });
}

function watchlistBox(desk, quotes, ent) {
  const symbols = desk.watchlistDefault;
  const limited = ent.watchlistLimit !== Infinity;
  // Free tier holds one item; the rest are shown but marked as over the limit.
  const shown = limited ? symbols.slice(0, 1) : symbols;

  const rows = shown.map((sym) => {
    const q = quotes.get(sym);
    if (!q) return null;
    return h('a', { class: 'srow', href: `./asset.html?s=${sym}` }, [
      h('span', { style: 'font-weight:600', text: q.name }),
      h('span', { class: 'srow__vals' }, [
        h('span', { class: 'num', style: 'font-weight:600', text: price(q.last, q.decimals) }),
        h('span', { class: `num ${toneOfQuote(q)}`, text: pctOf(q) }),
      ]),
    ]);
  }).filter(Boolean);

  const footer = limited
    ? h('p', { class: 'micro', style: 'margin-top:8px' }, [
        document.createTextNode('แพ็คเกจ Free จำกัด 1 watchlist · '),
        h('a', { class: 'accent', href: './pricing.html', style: 'font-weight:600', text: 'อัปเกรดเพื่อไม่จำกัด' }),
      ])
    : h('a', { class: 'accent', href: './index.html', style: 'font-size:12px;font-weight:600;display:inline-block;margin-top:8px', text: '+ เพิ่มสินทรัพย์' });

  const title = limited
    ? `Watchlist ของฉัน · ${shown.length}/1`
    : 'Watchlist ของฉัน · ไม่จำกัด';

  return boxed(title, [...rows, footer], { id: 'watchlist' });
}

function callsBox(desk, ent) {
  const calls = desk.calls;

  /* Exclusive: the full five-column table inside the double frame. */
  if (ent.analystCalls) {
    const table = h('table', { class: 'calls-table' }, [
      h('thead', {}, [h('tr', {}, [
        h('th', { scope: 'col', text: 'สินทรัพย์' }),
        h('th', { scope: 'col', text: 'คำแนะนำ' }),
        h('th', { scope: 'col', text: 'ราคาเข้า' }),
        h('th', { scope: 'col', text: 'เป้าหมาย TP' }),
        h('th', { scope: 'col', text: 'ตัดขาดทุน SL' }),
      ])]),
      h('tbody', {}, calls.items.map((c) => h('tr', {}, [
        h('td', { text: c.symbol }),
        h('td', { class: c.tone === 'up' ? 'up' : c.tone === 'down' ? 'down' : 'mut', style: 'font-weight:700', text: c.action }),
        h('td', { text: c.entry }),
        h('td', { text: c.target }),
        h('td', { text: c.stop }),
      ]))),
    ]);

    return h('section', { class: 'framed' }, [
      h('div', { class: 'kicker', text: 'EXCLUSIVE · คำแนะนำวันนี้ ✓' }),
      h('div', { style: 'margin-top:10px;overflow-x:auto' }, [table]),
      h('p', { class: 'micro', style: 'margin-top:8px', text: calls.reviewNote }),
    ]);
  }

  /* Free / Pro: a masked teaser plus the upgrade CTA. */
  const teaser = h('div', { class: 'stack stack-6 masked', style: 'margin-top:10px' },
    desk.teaser.map((t) => h('div', { class: 'row row--between', style: 'font-size:13px' }, [
      h('span', { style: 'font-weight:600', text: t.symbol }),
      h('span', { class: `num ${t.tone}`, style: 'font-weight:700', text: t.text }),
    ])));

  const ctaText = ent.tier === 'pro'
    ? `เพิ่มอีก ${usd(180)}/เดือน เพื่อปลดล็อกคำแนะนำ`
    : `ปลดล็อกด้วย Exclusive — ${usd(369)}/เดือน`;

  return h('section', { class: 'framed' }, [
    h('div', { class: 'kicker', text: 'EXCLUSIVE · คำแนะนำวันนี้ 🔒' }),
    teaser,
    h('a', {
      class: 'btn btn--accent btn--block', href: './pricing.html',
      style: 'margin-top:10px', text: ctaText,
    }),
  ]);
}

function alertsBox(desk, ent) {
  const items = ent.analystCalls
    ? [...desk.alerts.exclusiveItems, ...desk.alerts.items]
    : desk.alerts.items;

  return boxed('⚡ แจ้งเตือนเรียลไทม์', items.map((a) => h('div', { class: 'alerts__item' }, [
    h('span', { class: 'alerts__time', text: a.time }),
    h('div', { class: 'stack stack-2' }, [
      h('span', { class: 'kicker kicker--mut', text: a.category }),
      h('span', { class: a.tone === 'up' ? 'up' : a.tone === 'down' ? 'down' : '', text: a.text }),
    ]),
  ])));
}

function portfolioBox(desk) {
  const p = desk.portfolio;
  return boxed('Model Portfolio · EXCLUSIVE', [
    ...p.holdings.map((hd) => h('div', { class: 'srow' }, [
      h('span', { text: hd.name }),
      h('span', { class: 'num', style: 'font-weight:600', text: `${hd.weight}%` }),
    ])),
    h('dl', { class: 'portfolio-stats' }, p.stats.map((s) => h('div', {}, [
      h('dt', { text: s.label }),
      h('dd', { class: s.tone, text: s.value }),
    ]))),
  ]);
}

function liveQABox(qa) {
  return h('section', { class: 'qa-card' }, [
    h('div', { class: 'kicker', text: qa.kicker }),
    h('h2', { class: 'serif', style: 'font-size:19px;font-weight:600;margin-top:6px', text: qa.title }),
    h('p', { text: qa.text }),
    h('a', { class: 'btn btn--gold btn--block', href: './pricing.html', text: qa.cta }),
  ]);
}

function calendarBox(events) {
  return boxed('ปฏิทินเศรษฐกิจวันนี้', events.slice(0, 3).map((e) =>
    h('div', { class: 'srow srow--stack' }, [
      h('span', { style: 'font-weight:600;font-size:13px', text: `${e.flag} ${e.title} · ${e.when}` }),
      h('span', { class: 'micro num', text: e.note }),
    ])), { id: 'calendar' });
}

boot().catch((err) => {
  document.getElementById('home-main').replaceChildren(
    h('p', { class: 'mut', text: `โหลดข้อมูลไม่สำเร็จ: ${err.message} — ต้องเปิดผ่านเซิร์ฟเวอร์ (python serve.py)` }),
  );
  console.error(err);
});
