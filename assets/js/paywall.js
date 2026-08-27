/* ==========================================================================
   Libera Analysts — paywalled article (canvas option 3b)

   Same renderer as the article page. This entry point exists so a locked
   piece has its own URL: the homepage links here when the reader's tier
   cannot open the story, rather than bouncing them off a full article.
   ========================================================================== */

import { api, entitlements, quoteMap } from './store.js';
import { mountChrome, h } from './chrome.js';
import { renderArticle, renderArticleSide } from './article-view.js';

let ctx = null;

async function boot() {
  await mountChrome({ current: 'บทวิเคราะห์' });

  const [doc, quotes] = await Promise.all([api.articles(), quoteMap()]);
  const slug = new URLSearchParams(location.search).get('a');

  // Default to a genuinely gated piece so the page demonstrates the state.
  const article = doc.articles.find((a) => a.slug === slug)
    || doc.articles.find((a) => a.requiredTier !== 'free')
    || doc.articles[0];

  const related = doc.articles.filter((a) => a.slug !== article.slug).slice(0, 3);
  ctx = { doc, quotes, article, related };

  document.title = `${article.headline} — Libera Analysts`;

  render();
  window.addEventListener('libera:tierchange', render);
}

function render() {
  const { doc, quotes, article, related } = ctx;

  const { readable } = renderArticle(document.getElementById('paywall-main'), {
    article,
    author: doc.authors[article.author],
    ent: entitlements(),
    quotes,
  });

  // Upgrading while on this page should hand the reader the real article.
  if (readable) {
    history.replaceState(null, '', `./article.html?a=${article.slug}`);
  }

  renderArticleSide(document.getElementById('paywall-side'), { article, quotes, related });
}

boot().catch((err) => {
  document.getElementById('paywall-main').replaceChildren(
    h('p', { class: 'mut', text: `โหลดบทความไม่สำเร็จ: ${err.message}` }),
  );
  console.error(err);
});
