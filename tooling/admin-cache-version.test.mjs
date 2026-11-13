import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const VERSION = '20261113-admin-audit-p2';
const APP_VERSION = '20261114-qty100-v1';
const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('Admin media modules use one release cache key so phones cannot keep stale upload code', () => {
  assert.ok(read('admin/index.html').includes('js/app.js?v=' + APP_VERSION), 'Admin app entry must change on each media release');
  const imports = [
    ['admin/js/views/products.js', "../image-optimize.js?v=" + VERSION],
    ['admin/js/views/products.js', "../photo-upload.js?v=" + VERSION],
    ['admin/js/views/products.js', "../quick-product.js?v=" + VERSION],
    ['admin/js/views/model-colours.js', "../photo-upload.js?v=" + VERSION],
    ['admin/js/views/model-colours.js', "../image-optimize.js?v=" + VERSION],
    ['admin/js/photo-upload.js', "./image-optimize.js?v=" + VERSION],
    ['admin/js/quick-product.js', "./image-optimize.js?v=" + VERSION]
  ];
  assert.ok(read('admin/js/views/model-colours.js').includes('../colour-model.js?v=' + APP_VERSION), 'Colour model planner must have a fresh cache key');
  for (const [path, specifier] of imports) {
    assert.ok(read(path).includes(specifier), path + ' must version ' + specifier);
  }
});
