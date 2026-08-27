/* ==========================================================================
   Libera Analysts — charts

   The canvas drew these as hand-authored SVG paths. Here they are plotted
   from real prices, preserving the design decisions the handoff pins down:
     · 2px line stroke, area fill at ~7% of the line colour
     · horizontal dashed reference lines for support / pivot / resistance,
       each with a right-anchored 11px mono label
     · no gridlines, no axis chrome
     · sparklines 64×20, 1.5px stroke, no fill
   ========================================================================== */

const NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}, parent = null) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    node.setAttribute(k, String(v));
  }
  if (parent) parent.appendChild(node);
  return node;
}

/** Labels come from JSON — always inserted as text, never as markup. */
function svgText(parent, str, attrs = {}) {
  const node = el('text', attrs, parent);
  node.textContent = str;
  return node;
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/* ------------------------------------------------------------ sparkline -- */

/**
 * 64×20 trend line for a dashboard row. Direction drives the colour through
 * the .spark--up / .spark--down classes, so it follows the theme.
 */
export function sparkline(mount, values, direction) {
  mount.replaceChildren();
  if (!values || values.length < 2) return;

  const w = 64, h = 20, pad = 2;
  const svg = el('svg', {
    viewBox: `0 0 ${w} ${h}`, width: w, height: h,
    class: `spark spark--${direction}`, 'aria-hidden': 'true',
  }, mount);

  const min = Math.min(...values);
  const max = Math.max(...values);
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  el('polyline', { points: pts.join(' '), 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
  return svg;
}

/* -------------------------------------------------- annotated price chart -- */

export class PriceChart {
  /**
   * @param {HTMLElement} mount
   * @param {object} opts  { points, levels, decimals, height, direction, onHover }
   */
  constructor(mount, opts) {
    this.mount = mount;
    this.opts = { height: 260, decimals: 2, direction: 'up', levels: [], ...opts };

    this._redraw = debounce(() => this.render(), 90);
    this._ro = new ResizeObserver(() => this._redraw());
    this._ro.observe(mount);

    // SVG bakes in resolved colours, so a theme flip has to re-draw.
    this._onTheme = () => this.render();
    window.addEventListener('libera:themechange', this._onTheme);
    this._mq = window.matchMedia('(prefers-color-scheme: dark)');
    this._mq.addEventListener('change', this._onTheme);
  }

  update(opts) {
    this.opts = { ...this.opts, ...opts };
    this.render();
  }

  destroy() {
    this._ro.disconnect();
    window.removeEventListener('libera:themechange', this._onTheme);
    this._mq.removeEventListener('change', this._onTheme);
    this.mount.replaceChildren();
  }

  render() {
    const { points, levels, height, decimals, direction } = this.opts;
    this.mount.replaceChildren();

    // One observation is not a line. Say so rather than drawing an empty box;
    // the path fills in as the fetcher polls.
    if (!points || points.length < 2) {
      const note = document.createElement('p');
      note.className = 'mut';
      note.style.cssText = `height:${height}px;display:flex;align-items:center;justify-content:center;font-size:13px;text-align:center`;
      note.textContent = 'ยังมีข้อมูลราคาไม่พอวาดกราฟ — เส้นจะขึ้นเองหลังดึงราคารอบถัดไป';
      this.mount.appendChild(note);
      return;
    }

    const width = Math.max(320, Math.floor(this.mount.clientWidth || 800));

    const ink      = cssVar('--ink');
    const muted    = cssVar('--ink-muted');
    const upCol    = cssVar('--up');
    const downCol  = cssVar('--down');
    const lineCol  = direction === 'down' ? downCol : upCol;

    const svg = el('svg', {
      viewBox: `0 0 ${width} ${height}`, width, height,
      role: 'img',
      'aria-label': this.opts.ariaLabel || 'กราฟราคา',
    }, this.mount);
    svg.style.width = '100%';
    svg.style.height = `${height}px`;

    /* -- domain: the price path plus every reference line, with headroom -- */
    const levelPrices = levels.map((l) => l.price);
    let min = Math.min(...points, ...levelPrices);
    let max = Math.max(...points, ...levelPrices);
    const padY = (max - min || 1) * 0.08;
    min -= padY; max += padY;

    // Right gutter holds the level labels; measured after drawing, but a
    // fixed reserve keeps the path from ever running under the text.
    const gutter = Math.min(260, Math.max(150, width * 0.28));
    const plotW = width - gutter;

    const X = (i) => (i / (points.length - 1)) * plotW;
    const Y = (v) => height - ((v - min) / (max - min || 1)) * height;

    /* -- reference lines: dashed, full width, label anchored right ------- */
    const DASH = { resistance: '5,4', pivot: '3,4', support: '5,4' };
    const COLOR = { resistance: downCol, pivot: muted, support: upCol };

    for (const lv of levels) {
      const y = Y(lv.price);
      el('line', {
        x1: 0, x2: width, y1: y, y2: y,
        stroke: COLOR[lv.kind] || muted,
        'stroke-width': 1,
        'stroke-dasharray': DASH[lv.kind] || '4,4',
      }, svg);

      svgText(svg, lv.label, {
        x: width - 2,
        // Sit the label just above its line, nudged down when it would clip.
        y: y < 14 ? y + 14 : y - 6,
        'text-anchor': 'end',
        'font-size': 11,
        'font-family': "'IBM Plex Mono', ui-monospace, monospace",
        fill: COLOR[lv.kind] || muted,
      }, svg);
    }

    /* -- price path ------------------------------------------------------ */
    const d = points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p).toFixed(1)}`).join('');

    el('path', {
      d: `${d}L${X(points.length - 1).toFixed(1)},${height}L0,${height}Z`,
      fill: lineCol, 'fill-opacity': 0.07, stroke: 'none',
    }, svg);

    el('path', {
      d, fill: 'none', stroke: lineCol,
      'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    }, svg);

    /* -- hover readout --------------------------------------------------- */
    const hover = el('g', { opacity: 0, 'pointer-events': 'none' }, svg);
    const vline = el('line', { y1: 0, y2: height, stroke: muted, 'stroke-width': 1 }, hover);
    const dot = el('circle', { r: 4, fill: lineCol, stroke: cssVar('--bg'), 'stroke-width': 2 }, hover);
    const tagBg = el('rect', { rx: 3, fill: ink, height: 20 }, hover);
    const tagTx = svgText(hover, '', {
      'font-size': 11, 'font-family': "'IBM Plex Mono', ui-monospace, monospace",
      fill: cssVar('--bg'), 'text-anchor': 'middle', dy: 4,
    });

    const overlay = el('rect', {
      x: 0, y: 0, width: plotW, height,
      fill: 'transparent', tabindex: 0, role: 'application',
      'aria-label': 'อ่านราคาทีละจุด — ใช้ปุ่มลูกศรซ้าย/ขวา',
    }, svg);

    let cursor = points.length - 1;
    const fmt = (v) => Number(v).toLocaleString('en-US', {
      minimumFractionDigits: decimals, maximumFractionDigits: decimals,
    });

    const showAt = (i) => {
      cursor = Math.max(0, Math.min(points.length - 1, i));
      const px = X(cursor), py = Y(points[cursor]);
      vline.setAttribute('x1', px); vline.setAttribute('x2', px);
      dot.setAttribute('cx', px); dot.setAttribute('cy', py);

      const label = fmt(points[cursor]);
      tagTx.textContent = label;
      const w = label.length * 6.6 + 14;
      tagBg.setAttribute('width', w);
      tagBg.setAttribute('x', Math.min(Math.max(px - w / 2, 0), plotW - w));
      tagBg.setAttribute('y', Math.max(py - 30, 0));
      tagTx.setAttribute('x', Math.min(Math.max(px, w / 2), plotW - w / 2));
      tagTx.setAttribute('y', Math.max(py - 30, 0) + 10);

      hover.setAttribute('opacity', 1);
      this.opts.onHover?.(points[cursor], cursor);
    };

    const fromPointer = (ev) => {
      const box = svg.getBoundingClientRect();
      const ratio = (ev.clientX - box.left) / (box.width || 1);
      showAt(Math.round((ratio * width / plotW) * (points.length - 1)));
    };

    overlay.addEventListener('pointermove', fromPointer);
    overlay.addEventListener('pointerdown', fromPointer);
    overlay.addEventListener('pointerleave', () => hover.setAttribute('opacity', 0));
    overlay.addEventListener('focus', () => showAt(cursor));
    overlay.addEventListener('blur', () => hover.setAttribute('opacity', 0));
    overlay.addEventListener('keydown', (ev) => {
      const step = ev.shiftKey ? 10 : 1;
      if (ev.key === 'ArrowRight') { showAt(cursor + step); ev.preventDefault(); }
      else if (ev.key === 'ArrowLeft') { showAt(cursor - step); ev.preventDefault(); }
      else if (ev.key === 'Home') { showAt(0); ev.preventDefault(); }
      else if (ev.key === 'End') { showAt(points.length - 1); ev.preventDefault(); }
      else if (ev.key === 'Escape') { hover.setAttribute('opacity', 0); }
    });
  }
}

function debounce(fn, ms) {
  let id;
  return (...args) => { clearTimeout(id); id = setTimeout(() => fn(...args), ms); };
}
