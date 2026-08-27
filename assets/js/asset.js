/* ==========================================================================
   Libera Analysts — asset detail page (canvas option 2a)
   ========================================================================== */

import { api, entitlements, quoteMap } from './store.js';
import { mountChrome, h } from './chrome.js';
import { price, changeText, pct, toneOf, toneOfQuote, usd } from './format.js';
import { PriceChart } from './charts.js';

let ctx = null;
let chart = null;

async function boot() {
  await mountChrome({ current: 'หุ้นรายตัว' });

  const [assetsDoc, quotes, seriesDoc] = await Promise.all([
    getAssets(), quoteMap(), api.series(),
  ]);

  const wanted = new URLSearchParams(location.search).get('s') || 'NVDA';
  const detail = assetsDoc.assets[wanted] || assetsDoc.assets.NVDA;
  const quote = quotes.get(detail.symbol);

  ctx = {
    detail, quote, quotes,
    defaults: assetsDoc.default,
    series: seriesDoc.series[detail.symbol],
  };

  document.title = `${detail.longName} (${detail.symbol}) — Libera Analysts`;

  render();
  window.addEventListener('libera:tierchange', render);

  window.addEventListener('libera:quotesupdate', (ev) => {
    const fresh = ev.detail.map.get(ctx.detail.symbol);
    if (fresh) ctx.quote = fresh;
    ctx.quotes = ev.detail.map;
    render();
  });
}

function getAssets() {
  return fetch('./data/assets.json', { cache: 'no-store' }).then((r) => {
    if (!r.ok) throw new Error(`assets.json → HTTP ${r.status}`);
    return r.json();
  });
}

function render() {
  const ent = entitlements();
  renderHead(ent);
  renderMain(ent);
  renderSide(ent);
}

/* ------------------------------------------------------------------ head -- */

function renderHead(ent) {
  const { detail, quote } = ctx;
  const tone = toneOfQuote(quote);

  document.getElementById('instrument-head').replaceChildren(
    h('div', { style: 'padding:20px var(--page-pad) 0' }, [
      h('nav', { class: 'breadcrumb', 'aria-label': 'ตำแหน่งหน้า' },
        detail.breadcrumb.map((b, i) => h('span', {}, [
          i ? document.createTextNode('· ') : null,
          h('span', { text: b }),
        ]))),

      h('div', { class: 'instrument' }, [
        h('h1', { class: 'instrument__name', style: 'font-size:32px', text: detail.longName }),
        h('div', { class: 'instrument__actions' }, [
          watchlistButton(ent),
          h('a', { class: 'btn btn--fill', href: './pricing.html', text: 'ตั้งการแจ้งเตือน' }),
        ]),
      ]),

      h('div', { class: 'quote', style: 'margin-top:6px' }, [
        h('span', { class: 'quote__last', style: 'font-size:40px', text: price(quote.last, quote.decimals) }),
        h('span', { class: `quote__change ${tone}`, style: 'font-size:20px', text: changeText(quote) }),
        h('span', {
          class: 'quote__note',
          text: ent.realtimeQuotes
            ? detail.marketStatus
            : `${detail.marketStatus} · ข้อมูลล่าช้า 15 นาที`,
        }),
      ]),
    ]),
  );
}

function watchlistButton(ent) {
  let saved = false;
  const btn = h('button', { class: 'btn', type: 'button', text: '+ เพิ่มใน Watchlist' });
  btn.addEventListener('click', () => {
    if (ent.watchlistLimit !== Infinity) { location.href = './pricing.html'; return; }
    saved = !saved;
    btn.textContent = saved ? '✓ อยู่ใน Watchlist' : '+ เพิ่มใน Watchlist';
    btn.classList.toggle('btn--fill', saved);
  });
  return btn;
}

/* ------------------------------------------------------------ main column -- */

function renderMain() {
  const { detail, quote, series, defaults } = ctx;
  const chartMount = h('div', { class: 'chart' });

  document.getElementById('asset-main').replaceChildren(
    rangeSelector(defaults.ranges),
    chartMount,
    statStrip(detail.stats),

    detail.analysisSlug
      ? h('a', {
          class: 'btn btn--accent', style: 'margin-top:18px',
          href: `./analysis.html?s=${detail.analysisSlug}`,
          text: 'อ่านบทวิเคราะห์เชิงลึกรายวัน →',
        })
      : null,

    h('h2', { class: 'section-head', style: 'margin-top:26px', text: 'ข่าวที่เกี่ยวข้อง' }),
    ...detail.news.map((n) => h('a', { class: 'srow srow--stack', href: './article.html' }, [
      h('span', { class: 'hl', style: 'font-size:16px', text: n.headline }),
      h('span', { class: 'micro', text: n.source }),
    ])),
  );

  chart?.destroy();
  chart = new PriceChart(chartMount, {
    points: series.points,
    levels: [],                       // the asset page shows a clean price line
    decimals: quote.decimals,
    direction: toneOfQuote(quote) || 'up',
    height: 280,
    ariaLabel: `กราฟราคา ${detail.longName}`,
  });
  chart.render();
}

function rangeSelector(ranges) {
  const group = h('div', { class: 'range', role: 'group', 'aria-label': 'ช่วงเวลากราฟ', style: 'margin:6px 0 8px' },
    ranges.map((r, i) => h('button', {
      type: 'button', class: 'num', 'aria-pressed': i === 0 ? 'true' : 'false', text: r,
    })));

  group.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button');
    if (!btn) return;
    [...group.children].forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
  });
  return group;
}

function statStrip(stats) {
  return h('div', {
    class: 'stat-strip',
    style: `grid-template-columns:repeat(${stats.length},1fr);margin-top:14px`,
  }, stats.map((s) => h('div', { class: 'stat-strip__cell' }, [
    h('span', { class: 'stat-strip__label', text: s.label }),
    h('span', { class: `stat-strip__value ${s.tone || ''}`, text: s.value }),
  ])));
}

/* ---------------------------------------------------------------- sidebar -- */

function renderSide(ent) {
  const { detail } = ctx;
  document.getElementById('asset-side').replaceChildren(
    analystBox(detail, ent),
    aiSummaryBox(detail),
    peersBox(detail),
  );
}

function analystBox(detail, ent) {
  const a = detail.analyst;

  const cell = (value, label, tone) => h('div', { class: 'stack', style: 'align-items:center;flex:1;min-width:0' }, [
    h('span', { class: `num ${tone || ''}`, style: 'font-size:19px;font-weight:700;text-align:center', text: value }),
    h('span', { class: 'micro', text: label }),
  ]);
  const divider = () => h('div', { style: 'width:1px;height:44px;background:var(--border);flex:none' });

  const body = h('div', { class: 'row', style: 'gap:12px;margin-top:12px' }, [
    cell(a.recommendation, 'คำแนะนำ', a.tone),
    divider(),
    cell(a.target, 'ราคาเป้าหมาย'),
    divider(),
    cell(a.upside, 'Upside', a.tone),
  ]);

  // The analyst view is a Pro benefit; Free sees it faded behind the CTA.
  if (!ent.canRead('pro')) {
    return h('section', { class: 'framed' }, [
      h('div', { class: 'kicker', text: 'มุมมองนักวิเคราะห์ 🔒' }),
      h('div', { class: 'masked' }, [body]),
      h('a', {
        class: 'btn btn--accent btn--block', href: './pricing.html', style: 'margin-top:10px',
        text: `ปลดล็อกด้วย Pro — ${usd(189)}/เดือน`,
      }),
    ]);
  }

  return h('section', { class: 'framed' }, [
    h('div', { class: 'kicker', text: 'มุมมองนักวิเคราะห์ ✓' }),
    body,
    h('p', { class: 'micro', style: 'margin-top:10px', text: a.note }),
  ]);
}

function aiSummaryBox(detail) {
  return h('section', {}, [
    h('h2', { class: 'section-head section-head--accent', text: '✦ AI SUMMARY' }),
    h('p', { style: 'font-size:13.5px;line-height:1.75;margin-top:10px', text: detail.aiSummary }),
  ]);
}

function peersBox(detail) {
  const { quotes } = ctx;
  return h('section', {}, [
    h('h2', { class: 'section-head', text: 'สินทรัพย์ใกล้เคียง · PEERS' }),
    ...detail.peers.map((p) => {
      const known = quotes.has(p.symbol);
      const row = [
        h('span', { style: 'font-weight:600', text: p.name }),
        h('span', { class: `num ${toneOf(p.changePct)}`, text: pct(p.changePct) }),
      ];
      return known
        ? h('a', { class: 'srow', href: `./asset.html?s=${p.symbol}` }, row)
        : h('div', { class: 'srow' }, row);
    }),
  ]);
}

boot().catch((err) => {
  document.getElementById('asset-main').replaceChildren(
    h('p', { class: 'mut', text: `โหลดข้อมูลไม่สำเร็จ: ${err.message}` }),
  );
  console.error(err);
});
