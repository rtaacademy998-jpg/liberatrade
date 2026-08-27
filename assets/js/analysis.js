/* ==========================================================================
   Libera Analysts — deep analysis page (canvas options 7a / 8a)

   The product's core value screen. Entitlement-driven: the analysis body is
   gated by the page's requiredTier, and the analyst call box is Exclusive.
   ========================================================================== */

import { api, entitlements, quoteMap, tierBadgeText } from './store.js';
import { mountChrome, h } from './chrome.js';
import { price, changeText, toneOf, toneOfQuote, usd } from './format.js';
import { PriceChart } from './charts.js';

const RANGES = ['1D', '1W', '1M', 'YTD', '1Y', '5Y'];

let ctx = null;
let chart = null;

async function boot() {
  const slug = new URLSearchParams(location.search).get('s') || 'xauusd';

  const [analysis, quotes, seriesDoc, desk] = await Promise.all([
    api.analysis(), quoteMap(), api.series(), api.desk(),
  ]);

  const page = analysis.pages[slug] || analysis.pages.xauusd;
  const quote = quotes.get(page.symbol);
  const series = seriesDoc.series[page.symbol];

  ctx = { page, quote, series, desk };
  document.title = `${page.title} — บทวิเคราะห์ | Libera Analysts`;

  await mountChrome({ variant: 'inline', navHighlight: page.navHighlight });

  render();
  window.addEventListener('libera:tierchange', render);

  window.addEventListener('libera:quotesupdate', (ev) => {
    const fresh = ev.detail.map.get(ctx.page.symbol);
    if (fresh) ctx.quote = fresh;
    render();
  });
}

function render() {
  const ent = entitlements();
  renderInstrumentHead(ent);
  renderMain(ent);
  renderSide(ent);
}

/* --------------------------------------------------- instrument header -- */

function renderInstrumentHead(ent) {
  const { page, quote } = ctx;
  const tone = toneOfQuote(quote);

  document.getElementById('instrument-head').replaceChildren(
    h('div', { style: 'padding:20px var(--page-pad) 0' }, [
      h('nav', { class: 'breadcrumb', 'aria-label': 'ตำแหน่งหน้า' },
        page.breadcrumb.map((b, i) => h('span', {}, [
          i ? document.createTextNode('· ') : null,
          h('span', { text: b }),
        ]))),

      h('div', { class: 'instrument' }, [
        h('div', { class: 'quote' }, [
          h('h1', { class: 'instrument__name', text: page.title }),
          h('span', { class: 'quote__last', text: price(quote.last, quote.decimals) }),
          h('span', { class: `quote__change ${tone}`, text: changeText(quote) }),
          h('span', {
            class: 'quote__note',
            text: ent.realtimeQuotes
              ? `${page.unit} · ${page.quoteTime}`
              : `${page.unit} · ${page.quoteTime} · ข้อมูลล่าช้า 15 นาที`,
          }),
        ]),
        h('div', { class: 'instrument__actions' }, [
          watchlistButton(ent),
          h('a', { class: 'btn btn--fill', href: './pricing.html', text: 'ตั้งแจ้งเตือนราคา' }),
        ]),
      ]),
    ]),
  );
}

function watchlistButton(ent) {
  let saved = false;
  const btn = h('button', { class: 'btn', type: 'button', text: '+ Watchlist' });

  btn.addEventListener('click', () => {
    // Free tier is already at its 1-item limit — prompt instead of adding.
    if (ent.watchlistLimit !== Infinity) {
      location.href = './pricing.html';
      return;
    }
    saved = !saved;
    btn.textContent = saved ? '✓ อยู่ใน Watchlist' : '+ Watchlist';
    btn.classList.toggle('btn--fill', saved);
  });
  return btn;
}

/* ----------------------------------------------------------- main column -- */

function renderMain(ent) {
  const { page, quote, series } = ctx;
  const main = document.getElementById('analysis-main');
  const readable = ent.canRead(page.requiredTier);

  const chartMount = h('div', { class: 'chart' });

  main.replaceChildren(
    rangeSelector(),
    chartMount,
    statStrip(page, quote),

    h('div', { class: 'kicker', style: 'margin-top:26px', text: page.kicker }),
    h('p', {
      class: 'micro', style: 'margin-top:4px',
      text: 'ราคาด้านบนเป็นข้อมูลล่าสุด · บทวิเคราะห์และระดับราคาด้านล่างเขียนไว้ ณ วันที่ระบุ',
    }),
    h('h2', { class: 'hl', style: 'font-size:30px;margin:10px 0', text: page.headline }),
    authorRow(page),

    ...(readable ? readableBody(page) : gatedBody(page, ent)),
  );

  chart?.destroy();
  chart = new PriceChart(chartMount, {
    points: series.points,
    levels: page.chartLevels,
    decimals: quote.decimals,
    direction: toneOfQuote(quote) || 'up',
    height: 260,
    ariaLabel: `กราฟราคา ${page.title} พร้อมแนวรับแนวต้าน`,
  });
  chart.render();
}

function rangeSelector() {
  const group = h('div', { class: 'range', role: 'group', 'aria-label': 'ช่วงเวลากราฟ', style: 'margin:6px 0 8px' },
    RANGES.map((r, i) => h('button', {
      type: 'button', class: 'num', 'aria-pressed': i === 0 ? 'true' : 'false', text: r,
    })));

  group.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button');
    if (!btn) return;
    // Single-select. A real build refetches the series for the chosen range;
    // the sample data ships 1D only, so the others reuse it.
    [...group.children].forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
  });
  return group;
}

/**
 * Session numbers come from the live quote; only the genuinely editorial
 * figures (52-week range, YTD) stay in analysis.json.
 *
 * Without this the strip would print the session the analyst wrote about
 * while the header prints today's price — two different days side by side.
 */
function statStrip(page, quote) {
  const n = (v) => price(v, quote.decimals);
  const known = quote.changeKnown !== false;

  const live = [
    { label: 'เปิด', value: n(quote.open) },
    { label: 'สูงสุด/ต่ำสุดวันนี้', value: `${n(quote.high)} / ${n(quote.low)}` },
    { label: 'ปิดก่อนหน้า', value: known ? n(quote.prevClose) : '—' },
  ];

  // Keep any editorial stat the live feed cannot supply.
  const editorial = (page.stats || []).filter((s) =>
    /52|YTD|ATH|P\/E/i.test(s.label) || /สัปดาห์|ห่างจาก/.test(s.label));

  const stats = [...live, ...editorial];

  return h('div', {
    class: 'stat-strip',
    style: `grid-template-columns:repeat(${stats.length},1fr);margin-top:14px`,
  }, stats.map((s) => h('div', { class: 'stat-strip__cell' }, [
    h('span', { class: 'stat-strip__label', text: s.label }),
    h('span', { class: `stat-strip__value ${s.tone || ''}`, text: s.value }),
  ])));
}

function authorRow(page) {
  return h('div', { class: 'row row-12', style: 'margin-bottom:16px' }, [
    h('div', { class: 'avatar avatar--lg', text: page.author.initials }),
    h('div', { class: 'stack' }, [
      h('span', { style: 'font-weight:600;font-size:13px', text: `${page.author.name} — ${page.author.role}` }),
      h('span', { class: 'mut', style: 'font-size:12px', text: page.updatedLabel }),
    ]),
  ]);
}

function bodyBlock(block) {
  if (block.type === 'pull') {
    return h('blockquote', { class: 'pull', text: `"${block.text}"` });
  }
  const p = h('p', { class: 'body-copy', style: 'margin-top:14px' });
  if (block.lead) p.appendChild(h('b', { text: `${block.lead} ` }));
  p.appendChild(document.createTextNode(block.text));
  return p;
}

function readableBody(page) {
  return [
    ...page.body.map(bodyBlock),
    scenarioBox(page.scenario),
    h('p', { class: 'disclaimer', text: page.disclaimer }),
  ];
}

/**
 * Locked view: one free paragraph, the next faded, then the conversion box.
 * The mask is presentation only — a real API returns only the teaser.
 */
function gatedBody(page, ent) {
  const [first, second] = page.body;
  const badge = tierBadgeText(page.requiredTier);
  const priceTag = page.requiredTier === 'exclusive' ? usd(369) : usd(189);

  return [
    bodyBlock(first),
    second ? h('div', { class: 'masked' }, [bodyBlock(second)]) : null,

    h('div', { class: 'paywall' }, [
      h('h3', { class: 'paywall__title', text: `อ่านต่อด้วยแพ็คเกจ ${badge === 'PRO' ? 'Pro' : 'Exclusive'}` }),
      h('p', {
        class: 'paywall__copy',
        text: 'บทวิเคราะห์เชิงลึกพร้อมระดับราคาสำคัญ กลยุทธ์สองทาง และอินดิเคเตอร์ครบชุด สำหรับสมาชิกระดับ ' + badge,
      }),
      h('div', { class: 'paywall__ctas' }, [
        h('a', { class: 'btn btn--fill', href: './pricing.html', text: `สมัคร ${badge === 'PRO' ? 'Pro' : 'Exclusive'} — ${priceTag}/เดือน` }),
        h('a', { class: 'btn btn--accent', href: './pricing.html', text: 'ดูทุกแพ็คเกจ' }),
      ]),
      page.requiredTier !== 'exclusive'
        ? h('p', { class: 'micro', style: 'margin-top:14px', text: `ต้องการคำแนะนำรายสินทรัพย์ด้วย? แพ็คเกจ Exclusive ${usd(369)}/เดือน` })
        : null,
    ]),

    h('p', { class: 'disclaimer', text: page.disclaimer }),
  ].filter(Boolean);
}

function scenarioBox(sc) {
  const cell = (side, variant) => h('div', { class: 'scenario__cell' }, [
    h('div', { class: `scenario__title scenario__title--${variant}`, text: side.title }),
    ...side.rows.map((r) => h('div', { class: 'scenario__row' }, [
      h('span', { text: r.label }),
      h('b', { class: 'num', text: r.value }),
    ])),
  ]);

  return h('section', { class: 'scenario' }, [
    h('div', { class: 'scenario__head', text: sc.title }),
    h('div', { class: 'scenario__cells' }, [cell(sc.base, 'base'), cell(sc.alt, 'alt')]),
  ]);
}

/* -------------------------------------------------------------- sidebar -- */

function renderSide(ent) {
  const { page } = ctx;
  document.getElementById('analysis-side').replaceChildren(
    callBox(page, ent),
    levelsBox(page),
    technicalsBox(page),
    calendarBox(page),
    newsBox(page),
  );
}

function callBox(page, ent) {
  const call = page.call;

  if (!ent.analystCalls) {
    return h('section', { class: 'framed' }, [
      h('div', { class: 'kicker', text: `คำแนะนำ EXCLUSIVE · ${page.title} 🔒` }),
      h('div', { class: 'masked', style: 'margin-top:12px' }, [
        h('div', { class: 'row row-16' }, [
          h('div', { class: 'stack', style: 'align-items:center' }, [
            h('span', { class: `num ${call.actionTone}`, style: 'font-size:22px;font-weight:700', text: call.action }),
            h('span', { class: 'micro', text: call.actionLabel }),
          ]),
        ]),
      ]),
      h('a', {
        class: 'btn btn--accent btn--block', href: './pricing.html', style: 'margin-top:10px',
        text: ent.tier === 'pro' ? `เพิ่มอีก ${usd(180)}/เดือน` : `ปลดล็อกด้วย Exclusive — ${usd(369)}/เดือน`,
      }),
    ]);
  }

  return h('section', { class: 'framed' }, [
    h('div', { class: 'kicker', text: call.kicker }),
    h('div', { class: 'row row-16', style: 'margin:12px 0' }, [
      h('div', { class: 'stack', style: 'align-items:center;flex:1' }, [
        h('span', { class: `num ${call.actionTone}`, style: 'font-size:22px;font-weight:700;text-align:center', text: call.action }),
        h('span', { class: 'micro', text: call.actionLabel }),
      ]),
      h('div', { style: 'width:1px;height:44px;background:var(--border);flex:none' }),
      h('div', { class: 'stack', style: 'align-items:center;flex:1' }, [
        h('span', { class: 'num', style: 'font-size:22px;font-weight:700', text: call.entry }),
        h('span', { class: 'micro', text: call.entryLabel }),
      ]),
    ]),
    h('div', { class: 'call__rows' }, call.rows.map((r) => h('div', { class: 'call__row' }, [
      h('span', { text: r.label }),
      h('b', { text: r.value }),
    ]))),
    h('p', { class: 'micro', style: 'margin-top:8px', text: call.footnote }),
  ]);
}

function levelsBox(page) {
  return h('section', { class: 'levels' }, [
    h('h2', { class: 'section-head', text: 'ระดับราคาสำคัญ · KEY LEVELS' }),
    ...page.levels.map((lv) => h('div', {
      class: `srow${lv.current ? ' is-current' : ''}`,
    }, [
      h('span', { style: lv.current ? 'font-weight:700' : null, text: lv.label }),
      h('span', { class: `num ${lv.tone || ''}`, style: 'font-weight:600', text: lv.value }),
    ])),
  ]);
}

function technicalsBox(page) {
  return h('section', {}, [
    h('h2', { class: 'section-head', text: 'อินดิเคเตอร์ · TECHNICALS' }),
    ...page.technicals.map((t) => h('div', { class: 'srow' }, [
      h('span', { text: t.label }),
      h('span', {
        class: `num ${t.tone || ''}`,
        style: `font-weight:${t.strong ? 700 : 600}`,
        text: t.value,
      }),
    ])),
  ]);
}

function calendarBox(page) {
  return h('section', {}, [
    h('h2', { class: 'section-head', text: 'เหตุการณ์ที่กระทบ · CALENDAR' }),
    ...page.calendar.map((e) => h('div', { class: 'srow srow--stack' }, [
      h('span', { style: 'font-weight:600;font-size:13px', text: e.title }),
      h('span', { class: 'micro num', text: e.note }),
    ])),
  ]);
}

function newsBox(page) {
  return h('section', {}, [
    h('h2', { class: 'section-head', text: 'ข่าวที่เกี่ยวข้อง' }),
    ...page.news.map((n) => h('a', { class: 'srow srow--stack', href: './article.html' }, [
      h('span', { class: 'hl', style: 'font-size:15px', text: n.headline }),
      h('span', { class: 'micro', text: n.source }),
    ])),
  ]);
}

boot().catch((err) => {
  document.getElementById('analysis-main').replaceChildren(
    h('p', { class: 'mut', text: `โหลดข้อมูลไม่สำเร็จ: ${err.message}` }),
  );
  console.error(err);
});
