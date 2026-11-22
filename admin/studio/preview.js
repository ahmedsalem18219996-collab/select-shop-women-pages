import { applyAccent, mountStack } from './motion.js';
import { mediaUrl } from '../js/api.js';

const target = document.getElementById('stack');
const empty = document.getElementById('empty');
const title = document.querySelector('h1');
const imagePath = /^women-storefront\/storefront\/[A-Za-z0-9][A-Za-z0-9_-]{0,120}\.(webp|jpg|jpeg|png)$/;
let stack;

addEventListener('message', event => {
  if (event.source !== parent || event.origin !== location.origin) return;
  const value = event.data;
  if (value?.type === 'women-stack-focus' && Number.isInteger(value.index)) {
    target.querySelectorAll('.ssm-card')[value.index]?.scrollIntoView({ block: 'start' });
    return;
  }
  if (value?.type !== 'women-stack-preview') return;
  title.textContent = String(value.title || '').slice(0, 200);
  const photos = Array.isArray(value.stack?.photos)
    ? value.stack.photos.filter(p => imagePath.test(p.path)).slice(0, 8).map(p => ({ ...p, url: mediaUrl(p.path) }))
    : [];
  applyAccent(document.documentElement, /^#[\da-f]{6}$/i.test(value.stack?.accent) ? value.stack.accent : '#111111');
  const scroll = scrollY;
  stack?.destroy();
  empty.hidden = photos.length > 0;
  if (photos.length) stack = mountStack(target, photos);
  requestAnimationFrame(() => scrollTo(0, scroll));
});
