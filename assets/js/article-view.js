/* ==========================================================================
   Libera Analysts — article rendering (canvas options 2b and 3b)

   One renderer serves both the readable article and the paywalled view: the
   locked state shows one free paragraph, fades the second, then the
   conversion box. The mask is presentation only — a real API returns just
   the teaser for a tier that cannot read the piece.
   ========================================================================== */

import { tierBadgeText } from './store.js';
import { h } from './chrome.js';
import { price, pctOf, toneOfQuote, usd } from './format.js';

const PLAN_PRICE = { pro: 189, exclusive: 369 };
const PLAN_NAME  = { pro: 'Pro', exclusive: 'Exclusive' };

export function renderArticle(mount, { article, author, ent, quotes }) {
  const readable = ent.canRead(article.requiredTier);
  const badge = tierBadgeText(article.requiredTier);

  const kickerText = readable
    ? article.kicker
    : `${article.kicker} · สำหรับสมาชิก ${badge} ขึ้นไป 🔒`;

  mount.replaceChildren(
    h('div', { class: 'kicker', text: kickerText }),
    h('h1', { class: 'article__headline', text: article.headline }),

    bylineRow(article, author),

    h('div', { class: 'ph article__hero', text: 'ภาพประกอบบทความ (แนบไฟล์จริงภายหลัง)' }),

    ...(readable ? readableBody(article) : lockedBody(article)),

    readable ? tagRow(article) : null,
    h('p', {
      class: 'disclaimer',
      text: 'การวิเคราะห์ทั้งหมดเป็นความเห็น ไม่ใช่คำชี้ชวนการลงทุน',
    }),
  );

  return { readable };
}

function bylineRow(article, author) {
  return h('div', { class: 'article__byline' }, [
    h('div', { class: 'avatar avatar--lg', text: author.initials }),
    h('div', { class: 'article__byline-text' }, [
      h('span', { class: 'article__author', text: author.name }),
      h('span', { class: 'mut', style: 'font-size:12px', text: author.role }),
    ]),
    h('span', {
      class: 'mut', style: 'font-size:12px',
      text: `${article.displayTime} · อ่าน ${article.readMinutes} นาที`,
    }),
    h('div', { class: 'row row-8' }, [
      h('button', { class: 'btn btn--sm', type: 'button', text: 'แชร์' }),
      h('button', { class: 'btn btn--sm', type: 'button', text: 'บันทึก' }),
    ]),
  ]);
}

function block(b) {
  if (b.type === 'pull') return h('blockquote', { class: 'pull', text: `"${b.text}"` });
  const p = h('p', { class: 'body-copy', style: 'margin-top:18px' });
  if (b.lead) p.appendChild(h('b', { text: `${b.lead} ` }));
  p.appendChild(document.createTextNode(b.text));
  return p;
}

function readableBody(article) {
  return [
    h('p', { class: 'standfirst', style: 'margin-top:20px;font-weight:500', text: article.standfirst }),
    ...article.body.map(block),
  ];
}

function lockedBody(article) {
  const [first, second] = article.body;
  const tier = article.requiredTier;

  return [
    h('p', { class: 'standfirst', style: 'margin-top:20px;font-weight:500', text: article.standfirst }),
    first ? block(first) : null,
    second ? h('div', { class: 'masked' }, [block(second)]) : null,

    h('div', { class: 'paywall' }, [
      h('h2', { class: 'paywall__title', text: `อ่านต่อด้วยแพ็คเกจ ${PLAN_NAME[tier]}` }),
      h('p', {
        class: 'paywall__copy',
        text: 'บทวิเคราะห์ฉบับเต็มพร้อมข้อมูลประกอบและมุมมองเชิงกลยุทธ์ สำหรับสมาชิกระดับ ' + tierBadgeText(tier) + ' ขึ้นไป',
      }),
      h('div', { class: 'paywall__ctas' }, [
        h('a', {
          class: 'btn btn--fill', href: './pricing.html',
          text: `สมัคร ${PLAN_NAME[tier]} — ${usd(PLAN_PRICE[tier])}/เดือน`,
        }),
        h('a', { class: 'btn btn--accent', href: './pricing.html', text: 'ดูทุกแพ็คเกจ' }),
      ]),
      tier !== 'exclusive'
        ? h('p', {
            class: 'micro', style: 'margin-top:14px',
            text: `ต้องการคำแนะนำรายสินทรัพย์และ Model Portfolio ด้วย? แพ็คเกจ Exclusive ${usd(369)}/เดือน`,
          })
        : null,
    ].filter(Boolean)),
  ].filter(Boolean);
}

function tagRow(article) {
  return h('div', { class: 'article__tags' },
    (article.tags || []).map((t) => h('a', { class: 'tag', href: './article.html', text: `#${t}` })));
}

/* -------------------------------------------------------------- sidebar -- */

export function renderArticleSide(mount, { article, quotes, related }) {
  mount.replaceChildren(
    mentionsBox(article, quotes),
    newsletterBox(),
    relatedBox(related),
  );
}

function mentionsBox(article, quotes) {
  const rows = (article.mentions || []).map((sym) => {
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

  return h('section', {}, [
    h('h2', { class: 'section-head', text: 'สินทรัพย์ที่กล่าวถึง' }),
    ...(rows.length ? rows : [h('p', { class: 'micro', style: 'padding-top:8px', text: 'ไม่มีสินทรัพย์ที่อ้างอิง' })]),
  ]);
}

function newsletterBox() {
  const form = h('form', { class: 'newsletter' }, [
    h('div', { class: 'kicker', text: 'MORNING BRIEF' }),
    h('p', { style: 'font-size:13px;line-height:1.7;margin:8px 0 0', text: 'สรุปตลาดส่งตรงถึงอีเมลก่อนตลาดเปิด ฟรี' }),
    h('label', { class: 'visually-hidden', for: 'nl-email', text: 'อีเมลของคุณ' }),
    h('input', { id: 'nl-email', type: 'email', required: true, placeholder: 'อีเมลของคุณ', autocomplete: 'email' }),
    h('button', { class: 'btn btn--fill btn--block', type: 'submit', style: 'margin-top:10px', text: 'สมัครรับ Morning Brief' }),
    h('p', { class: 'micro', style: 'margin-top:8px', text: 'ยกเลิกได้ทุกเมื่อ · เราไม่ส่งต่อข้อมูลให้บุคคลที่สาม' }),
  ]);

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const note = h('p', { class: 'micro up', style: 'margin-top:8px', text: '✓ สมัครเรียบร้อย — ตรวจสอบอีเมลเพื่อยืนยัน' });
    form.replaceChildren(
      h('div', { class: 'kicker', text: 'MORNING BRIEF' }),
      note,
    );
  });
  return form;
}

function relatedBox(related) {
  return h('section', {}, [
    h('h2', { class: 'section-head', text: 'อ่านต่อ' }),
    ...related.map((r) => h('a', { class: 'srow srow--stack', href: `./article.html?a=${r.slug}` }, [
      h('span', { class: 'hl', style: 'font-size:15px', text: r.headline }),
      h('span', { class: 'micro', text: `${r.assetLabel} · ${r.displayTime}` }),
    ])),
  ]);
}
