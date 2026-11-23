import { mountStack } from './motion.js?v=20261123-studio-v2';

export const SCROLL_HINT_STYLES = ['pill', 'arrow', 'finger', 'shine', 'dots', 'progress', 'none'];
export const DEFAULT_STUDIO_MARQUEE = {
  enabled: true,
  speed: 24,
  lines: ['الدفع عند الاستلام', 'عايني قبل ما تدفعي', 'شحن لكل المحافظات'].map(text => ({ text, hidden: false })),
};

export const hasStudioV2 = stack => Boolean(stack?.marquee || stack?.scrollHint);

const SVG = 'http://www.w3.org/2000/svg';
const DOWN = 'M12 4v15M6 13l6 6 6-6';
const FINGER = 'M9 13V5a1.5 1.5 0 0 1 3 0v5l3 .5 3 1a2 2 0 0 1 1.5 2l-.5 4a4 4 0 0 1-4 3.5h-3a4 4 0 0 1-3-1.5l-4-5a1.5 1.5 0 0 1 2-2zM19 3v5m-2-2 2 2 2-2';

function element(tag, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function icon(d) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}

export function createScrollHint(options, { preview = false, count = 3 } = {}) {
  const style = SCROLL_HINT_STYLES.includes(options?.style) ? options.style : 'pill';
  if (style === 'none') return null;
  const hint = element('div', 'ssm-v2-hint');
  hint.dataset.style = style;
  hint.setAttribute('aria-hidden', 'true');
  const label = 'اسحبي لتحت';
  if (style === 'dots') {
    for (let i = 0; i < Math.min(8, Math.max(1, count)); i++) hint.append(element('span'));
    hint.firstElementChild.dataset.active = '';
  } else if (style === 'progress') {
    hint.dataset.gradient = String(options?.gradient === true);
    hint.style.setProperty('--ssm-v2-progress', preview ? '.68' : '0');
    hint.append(element('span'));
  } else if (style === 'pill' || style === 'shine') {
    hint.append(label, icon(DOWN));
  } else {
    hint.append(icon(style === 'finger' ? FINGER : DOWN));
  }
  return hint;
}

export function createMarquee(settings = DEFAULT_STUDIO_MARQUEE, { preview = false } = {}) {
  if (settings?.enabled === false) return null;
  const entries = Array.isArray(settings?.lines) ? settings.lines : DEFAULT_STUDIO_MARQUEE.lines;
  const lines = entries.slice(0, 8).filter(line => typeof line?.text === 'string' && line.hidden !== true)
    .map(line => Array.from(line.text.trim()).slice(0, 60).join('')).filter(Boolean);
  if (!lines.length) return null;
  const speed = Number.isInteger(settings?.speed) ? Math.max(8, Math.min(60, settings.speed)) : DEFAULT_STUDIO_MARQUEE.speed;
  const marquee = element('div', 'ssm-v2-marquee');
  marquee.dir = 'rtl';
  marquee.style.setProperty('--ssm-v2-speed', `${speed}s`);
  const viewport = element('div', 'ssm-v2-marquee-viewport');
  const track = element('div', 'ssm-v2-marquee-track');
  const list = element('ul');
  list.setAttribute('role', 'list');
  for (const text of lines) {
    const line = element('li');
    line.textContent = text;
    list.append(line);
  }
  const copy = list.cloneNode(true);
  copy.setAttribute('aria-hidden', 'true');
  track.append(list, copy);
  viewport.append(track);
  marquee.append(viewport);
  if (!preview) {
    const toggle = element('button', 'ssm-v2-marquee-toggle');
    toggle.type = 'button';
    toggle.setAttribute('aria-label', 'إيقاف حركة الشريط');
    toggle.append(icon('M9 5v14M15 5v14'), icon('m8 5 11 7-11 7z'));
    toggle.addEventListener('click', () => {
      const paused = marquee.toggleAttribute('data-paused');
      toggle.setAttribute('aria-label', paused ? 'تشغيل حركة الشريط' : 'إيقاف حركة الشريط');
    });
    marquee.append(toggle);
  }
  return marquee;
}

function wireScrollHint(hint, gallery, signal) {
  if (hint.dataset.style === 'dots' || hint.dataset.style === 'progress') {
    const rail = element('div', 'ssm-v2-hint-rail');
    rail.dataset.style = hint.dataset.style;
    rail.append(hint);
    gallery.prepend(rail);
    const cards = [...gallery.querySelectorAll('.ssm-card')];
    let frame = 0;
    const update = () => {
      frame = 0;
      const { top, height } = gallery.getBoundingClientRect();
      const distance = Math.max(1, height - Math.min(innerHeight, cards.at(-1)?.offsetHeight || innerHeight));
      const progress = Math.max(0, Math.min(1, -top / distance));
      if (hint.dataset.style === 'progress') hint.style.setProperty('--ssm-v2-progress', String(Math.max(.06, progress)));
      else {
        const visible = Math.round(progress * (cards.length - 1));
        Array.from(hint.children).forEach((dot, i) => dot.toggleAttribute('data-active', i === visible));
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    addEventListener('scroll', schedule, { passive: true, signal });
    addEventListener('resize', schedule, { signal });
    signal.addEventListener('abort', () => cancelAnimationFrame(frame), { once: true });
    return;
  }

  gallery.querySelector('.ssm-card')?.append(hint);
  const dismiss = () => { hint.hidden = true; dismissal.abort(); };
  const dismissal = new AbortController();
  signal.addEventListener('abort', () => dismissal.abort(), { once: true });
  const arm = () => {
    const options = { once: true, passive: true, signal: dismissal.signal };
    addEventListener('pointerdown', dismiss, options);
    addEventListener('scroll', dismiss, options);
  };
  if (typeof IntersectionObserver !== 'function') arm();
  else {
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      arm();
    }, { threshold: .75 });
    observer.observe(hint);
    signal.addEventListener('abort', () => observer.disconnect(), { once: true });
  }
}

export function mountStudioStack(root, photos, design, marqueeSettings) {
  const cleanup = new AbortController();
  const gallery = element('div', 'ssm-stack--light ssm-v2-gallery');
  const marquee = design.marquee?.enabled === false ? null : createMarquee(marqueeSettings);
  const below = design.marquee?.position === 'below';
  root.append(...[!below && marquee, gallery, below && marquee].filter(Boolean));
  const stack = mountStack(gallery, photos, { lazyIntro: true });
  const hint = createScrollHint(design.scrollHint, { count: photos.length });
  if (hint) wireScrollHint(hint, gallery, cleanup.signal);
  if (marquee && typeof IntersectionObserver === 'function') {
    marquee.setAttribute('data-offscreen', '');
    const observer = new IntersectionObserver(([entry]) => marquee.toggleAttribute('data-offscreen', !entry.isIntersecting));
    observer.observe(marquee);
    cleanup.signal.addEventListener('abort', () => observer.disconnect(), { once: true });
  }
  return { destroy() { cleanup.abort(); stack.destroy(); root.replaceChildren(); } };
}
