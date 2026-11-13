// The one Admin photo batch upload (product photos tab and colour cards): every chosen photo appears at once
// with its own progress, is compressed by the existing optimizer, uploaded in order, and a failure never
// replaces or removes an already-saved photo. Returns { ok, total, missed: [{ file, text }] }.
import { island, fail } from './ui.js';
import { call, uploadProductImage } from './api.js';
import { checkSourceImage, optimizeUploadImage, previewTile, sizeLabel } from './image-optimize.js?v=20261113-admin-audit-p2';

export function classifyPhotoFiles(files) {
  const accepted = [], missed = [];
  for (const file of files) {
    const reason = checkSourceImage(file);
    if (reason) missed.push({ file, text: reason });
    else accepted.push(file);
  }
  return { accepted, missed, total: accepted.length + missed.length };
}

export async function uploadPhotos({ files, code, title, version, grid, before, fields = {} }) {
  const { accepted: list, missed, total } = classifyPhotoFiles(files);
  if (missed.length) island('error', missed[0].text + ' الصور غير المقبولة مش هتترفع؛ باقي الصور هنحاول نرفعها.');
  // An entirely rejected batch must never return 0/0, which callers treat as success.
  if (!list.length) return { ok: 0, total, missed };
  let ok = 0;
  const tiles = list.map((f) => previewTile(grid, before, f));
  try {
    for (const [i, f] of list.entries()) {
      island('busy', `رفع الصور ${i + 1}/${list.length}`);
      tiles[i].preparing();
      let prepared;
      try { prepared = await optimizeUploadImage(f, 'product'); }
      catch (err) {
        // The original stays untouched on the device and nothing reaches the store; carry on with the next photo.
        const text = 'ما اترفعتش: ' + (err?.message || 'الصورة لازم تكون JPG أو PNG أو WEBP.');
        tiles[i].failed(text); missed.push({ file: f, text }); continue;
      }
      tiles[i].uploading(prepared.uploadedBytes);
      const fd = new FormData();
      fd.append('code', code); fd.append('image', prepared.file); fd.append('version', String(version)); fd.append('alt', title);
      for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== '') fd.append(k, v);
      let res;
      try { res = await uploadProductImage(fd); } catch { res = { outcome: 'network' }; }
      if (res.outcome !== 'saved') {
        tiles[i].failed('ما اترفعتش. الصور القديمة زي ما هي.');
        missed.push({ file: f, text: 'ما اترفعتش. الصور القديمة زي ما هي.' });
        list.slice(i + 1).forEach((x, k) => { tiles[i + 1 + k].failed('اتوقفت قبل الرفع'); missed.push({ file: x, text: 'اتوقفت قبل الرفع' }); });
        fail(res); break;
      }
      ok++;
      tiles[i].ok(prepared.optimized ? 'اترفعت ✓ ' + sizeLabel(prepared.originalBytes) + ' ← ' + sizeLabel(prepared.uploadedBytes) : 'اترفعت ✓ ' + sizeLabel(prepared.uploadedBytes));
      // A saved photo may advance the media version; read it before the next one so a batch never fails half way.
      if (i + 1 < list.length) {
        let fresh;
        try { fresh = await call('products.get', { code }); } catch { fresh = { outcome: 'network' }; }
        if (fresh?.outcome === 'ok') version = fresh.data?.media?.structure_version ?? fresh.data?.product?.structure_version ?? version;
      }
    }
  } finally { tiles.forEach((tile) => tile.release()); }
  return { ok, total, missed };
}

/** Message after a batch, and the failed tiles put back once the page shows the saved photos. */
export function uploadSummary({ ok, total, missed }) {
  return ok === total ? '' : 'اترفع ' + ok + ' من ' + total + ' صورة. ما اترفعتش: ' + missed.map((m) => m.file.name).join('، ') + '. الصور الأصلية على جهازك زي ما هي؛ إعادة رفع الصور الناقصة فقط.';
}
