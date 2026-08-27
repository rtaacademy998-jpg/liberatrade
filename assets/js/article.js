/* ==========================================================================
   Libera Analysts — article page (canvas option 2b)
   ========================================================================== */

import { api, entitlements, quoteMap } from './store.js';
import { mountChrome, h } from './chrome.js';
import { renderArticle, renderArticleSide } from './article-view.js';

let ctx = null;

async function boot() {
  await mountChrome({ current: 'บทวิเคราะห์' });

  const [doc, quotes] = await Promise.all([api.articles(), quoteMap()]);
  const slug = new URLSearchParams(location.search).get('a');

  // No slug (or an unknown one) lands on the lead story.
  const article = doc.articles.find((a) => a.slug === slug)
    || doc.articles.find((a) => a.lead)
    || doc.articles[0];

  const related = doc.articles.filter((a) => a.slug !== article.slug).slice(0, 3);
  ctx = { doc, quotes, article, related };

  document.title = `${article.headline} — Libera Analysts`;

  render();
  window.addEventListener('libera:tierchange', render);
}

function render() {
  const { doc, quotes, article, related } = ctx;
  renderArticle(document.getElementById('article-main'), {
    article,
    author: doc.authors[article.author],
    ent: entitlements(),
    quotes,
  });
  renderArticleSide(document.getElementById('article-side'), { article, quotes, related });
}

boot().catch((err) => {
  document.getElementById('article-main').replaceChildren(
    h('p', { class: 'mut', text: `โหลดบทความไม่สำเร็จ: ${err.message}` }),
  );
  console.error(err);
});
