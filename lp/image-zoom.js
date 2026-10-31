// Original photographs load only after the shopper opens the detail view.
const data = document.getElementById('lp-data');
if (data) {
  const page = JSON.parse(data.textContent || '{}');
  const dialog = document.createElement('dialog');
  dialog.id = 'lpZoom';
  dialog.setAttribute('aria-label', 'تفاصيل الصورة');
  dialog.innerHTML = '<div class="zoom-tools"><button type="button" id="lpZoomClose" aria-label="اقفلي الصورة">إغلاق ×</button><button type="button" id="lpZoomToggle">تكبير أكتر</button></div><div class="zoom-scroll"><img id="lpZoomImage" alt=""></div>';
  const style = document.createElement('style');
  style.textContent = '#lpZoom{width:min(96vw,1200px);max-width:96vw;height:92dvh;max-height:92dvh;padding:0;border:0;background:#f7f6f2;color:#22251f}#lpZoom::backdrop{background:rgba(0,0,0,.8)}.zoom-tools{display:flex;justify-content:space-between;gap:12px;padding:12px}.zoom-tools button{min-height:44px;padding:8px 16px;background:#303c2d;color:white;border:0;font:inherit;cursor:pointer}.zoom-scroll{height:calc(100% - 68px);overflow:auto;direction:ltr;overscroll-behavior:contain}#lpZoomImage{display:block;width:100%;height:100%;object-fit:contain;margin:auto}#lpZoomImage.zoomed{width:max(1100px,100%);max-width:none;height:auto;object-fit:initial}';
  document.head.append(style);
  document.body.append(dialog);
  const large = dialog.querySelector('#lpZoomImage');
  const close = dialog.querySelector('#lpZoomClose');
  const toggle = dialog.querySelector('#lpZoomToggle');
  let opener;
  const decorate = () => document.querySelectorAll('#lpHero img, #lpGallery img').forEach(img => {
    img.setAttribute('role', 'button'); img.setAttribute('tabindex', '0');
    img.setAttribute('aria-label', 'كبّري الصورة: ' + (img.alt || 'البلوفر'));
    img.setAttribute('aria-haspopup', 'dialog');
  });
  const open = (img) => {
    const selected = document.querySelector('#lpColors .chip[aria-pressed="true"]')?.getAttribute('data-code') || page.code;
    const colour = page.colors?.find(c => c.code === selected);
    const index = img.closest('#lpHero') ? 0 : [...document.querySelectorAll('#lpGallery img')].indexOf(img) + 1;
    const src = colour?.zoom?.[index];
    if (!/^https:\/\/byluoipdunralsurwebt\.supabase\.co\/storage\/v1\/object\/public\/product-media\/media\/[a-f0-9]{32}\.(jpg|png|webp)$/.test(src || '')) return;
    opener = img; large.src = src; large.alt = img.alt;
    large.classList.remove('zoomed'); toggle.textContent = 'تكبير أكتر';
    dialog.showModal(); close.focus();
  };
  document.addEventListener('click', e => {
    if (e.target.matches('#lpHero img, #lpGallery img')) open(e.target);
  });
  document.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('#lpHero img, #lpGallery img')) { e.preventDefault(); open(e.target); }
  });
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { large.removeAttribute('src'); opener?.focus(); });
  toggle.addEventListener('click', () => {
    const zoomed = large.classList.toggle('zoomed'); toggle.textContent = zoomed ? 'عرض الصورة كاملة' : 'تكبير أكتر';
  });
  decorate();
  const gallery = document.getElementById('lpGallery');
  if (gallery) new MutationObserver(decorate).observe(gallery, { childList: true });
}
