import { applyAccent, mountStack, validStudioPhotoPath } from './motion.js?v=20261123-studio-v2';
import { hasStudioV2, mountStudioStack } from './studio-v2-motion.js?v=20261123-studio-v2';
import { mediaUrl } from '../js/api.js';

const target = document.getElementById('stack');
const empty = document.getElementById('empty');
const title = document.querySelector('h1');
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
    ? value.stack.photos.filter(p => validStudioPhotoPath(p?.path)).slice(0, 8).map(p => ({ ...p, url: mediaUrl(p.path) }))
    : [];
  applyAccent(document.documentElement, /^#[\da-f]{6}$/i.test(value.stack?.accent) ? value.stack.accent : '#111111');
  const scroll = scrollY;
  stack?.destroy();
  empty.hidden = photos.length > 0;
  if (photos.length) stack = hasStudioV2(value.stack)
    ? mountStudioStack(target, photos, value.stack, value.marqueeSettings)
    : mountStack(target, photos);
  requestAnimationFrame(() => scrollTo(0, scroll));
});
