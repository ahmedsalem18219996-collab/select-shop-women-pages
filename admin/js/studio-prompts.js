export const STUDIO_STYLES = [
  { key: 'model', label: 'موديل ترتدي القطعة', direction: 'an elegant adult female fashion model wearing the exact garment' },
  { key: 'flatlay', label: 'تصوير Flat Lay', direction: 'premium flat-lay fashion product photography' },
  { key: 'detail', label: 'تفاصيل الخامة والتقفيل', direction: 'close-up editorial product photography showing stitching and fabric texture' },
  { key: 'lifestyle', label: 'لوك يومي واقعي', direction: 'natural lifestyle fashion photography in a clean modern setting' },
];

export function buildGeminiPrompt({ title = '', description = '', style = 'model' } = {}) {
  const chosen = STUDIO_STYLES.find(x => x.key === style) || STUDIO_STYLES[0];
  const safeTitle = String(title).trim().slice(0, 180);
  const safeDescription = String(description).trim().slice(0, 500);
  return [
    'Create one premium, photorealistic Egyptian women’s fashion e-commerce image using the uploaded original product photo as the single source of truth.',
    'Product: ' + (safeTitle || 'women clothing item') + '.',
    safeDescription ? 'Product notes supplied by the seller: ' + safeDescription + '. Do not add any features that are not explicitly present in the reference photo or these notes.' : '',
    'Composition: ' + chosen.direction + '.',
    'CRITICAL PRODUCT ACCURACY: preserve the exact garment design, color, cut, silhouette, length, neckline, sleeves, buttons, print, embroidery, seams, fabric appearance and all visible details from the reference photo. Do not redesign, recolor, embellish, simplify or invent anything.',
    'Use an adult model if a model is shown. Keep natural body proportions, realistic hands and a believable fit. Do not make claims about fabric composition, waterproofing, origin, brand or performance.',
    'Premium soft editorial lighting, clean uncluttered background, realistic skin and fabric texture, sharp product focus, vertical 4:5 composition.',
    'No text, no typography, no labels, no watermark, no fake logos, no extra products, no collage, no borders.',
    'If the reference photo does not clearly show a detail, do not invent it. Prioritize faithful product representation over artistic changes.',
  ].filter(Boolean).join('\n\n');
}
