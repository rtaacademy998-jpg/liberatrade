/* ==========================================================================
   Libera Analysts — membership pricing (canvas option 3a)
   ========================================================================== */

import { api, session } from './store.js';
import { mountChrome, h } from './chrome.js';
import { usd } from './format.js';

let desk = null;
let billing = 'monthly';   // 'monthly' | 'yearly'

async function boot() {
  await mountChrome({ current: 'สมาชิก' });
  desk = await api.desk();

  renderHead();
  renderPlans();
  document.getElementById('pricing-note').textContent = desk.pricingNote;
}

function renderHead() {
  document.getElementById('pricing-head').replaceChildren(
    h('div', { class: 'pricing-head' }, [
      h('div', { class: 'kicker', text: 'MEMBERSHIP · แพ็คเกจสมาชิก' }),
      h('h1', { class: 'pricing-head__title', text: 'เข้าถึงมุมมองที่ตลาดยังไม่เห็น' }),
      h('p', {
        class: 'mut',
        style: 'max-width:560px;margin:0 auto;font-size:14px;line-height:1.7',
        text: 'บทวิเคราะห์จากทีมนักกลยุทธ์ที่ติดตามตลาดทุกวัน พร้อมข้อมูลราคาครบทุกสินทรัพย์ — เลือกระดับที่เหมาะกับวิธีลงทุนของคุณ',
      }),
      billingToggle(),
    ]),
  );
}

function billingToggle() {
  const group = h('div', { class: 'billing-toggle', role: 'group', 'aria-label': 'รอบการชำระเงิน' }, [
    h('button', { type: 'button', 'data-billing': 'monthly', 'aria-pressed': String(billing === 'monthly'), text: 'รายเดือน' }),
    h('button', { type: 'button', 'data-billing': 'yearly', 'aria-pressed': String(billing === 'yearly') }, [
      document.createTextNode('รายปี '),
      h('span', { class: 'discount', text: `−${desk.yearlyDiscount * 100}%` }),
    ]),
  ]);

  group.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button');
    if (!btn) return;
    billing = btn.dataset.billing;
    [...group.children].forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    renderPlans();
  });
  return group;
}

function renderPlans() {
  const mount = document.getElementById('plans');
  mount.replaceChildren(...desk.plans.map(planCard));
}

function planCard(plan) {
  const monthly = billing === 'yearly'
    ? Math.round(plan.priceMonthly * (1 - desk.yearlyDiscount))
    : plan.priceMonthly;

  const isCurrent = plan.id === session.tier;

  const ctaClass = plan.ctaStyle === 'fill' ? 'btn btn--fill btn--block'
                 : plan.ctaStyle === 'accent' ? 'btn btn--accent btn--block'
                 : 'btn btn--block';

  return h('article', { class: `plan${plan.popular ? ' plan--hot' : ''}` }, [
    plan.ribbon ? h('div', { class: 'plan__ribbon', text: plan.ribbon }) : null,

    h('div', { class: plan.id === 'exclusive' ? 'kicker' : 'kicker kicker--mut', text: plan.kicker }),

    h('div', { class: 'plan__price' }, [
      document.createTextNode(usd(monthly)),
      h('small', { text: '/เดือน' }),
    ]),
    billing === 'yearly' && plan.priceMonthly > 0
      ? h('p', { class: 'micro', style: 'margin-bottom:8px', text: `เรียกเก็บ ${usd(monthly * 12)} ต่อปี` })
      : null,

    h('p', { class: 'plan__pitch', text: plan.pitch }),

    h('div', {}, plan.features.map((f) => h('div', {
      class: `feat ${f.yes ? 'feat--yes' : 'feat--no'}`,
    }, [
      h('span', { class: 'feat__mark', 'aria-hidden': 'true', text: f.yes ? '✓' : '✕' }),
      h('span', { text: f.text }),
      // The mark is decorative; the state is also said in words for screen readers.
      h('span', { class: 'visually-hidden', text: f.yes ? '(รวมอยู่ในแพ็คเกจ)' : '(ไม่รวม)' }),
    ]))),

    h('div', { class: 'plan__spacer' }),

    isCurrent
      ? h('span', { class: 'btn btn--block', style: 'opacity:.55;cursor:default', text: 'แพ็คเกจปัจจุบันของคุณ' })
      : h('a', { class: ctaClass, href: './pricing.html', style: 'margin-top:18px', text: plan.cta }),
  ].filter(Boolean));
}

boot().catch((err) => {
  document.getElementById('plans').replaceChildren(
    h('p', { class: 'mut', text: `โหลดข้อมูลไม่สำเร็จ: ${err.message}` }),
  );
  console.error(err);
});
