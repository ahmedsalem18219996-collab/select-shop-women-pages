import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPhotoFiles } from '../admin/js/photo-upload.js';

const photo = (name, type, size) => ({ name, type, size, lastModified: 1 });

test('rejected mobile images count as failed, never as a successful 0/0 batch', () => {
  const heic = photo('camera.heic', 'image/heic', 1024);
  const tooLarge = photo('camera.jpg', 'image/jpeg', 26 * 1024 * 1024);
  const result = classifyPhotoFiles([heic, tooLarge]);
  assert.equal(result.total, 2);
  assert.equal(result.accepted.length, 0);
  assert.equal(result.missed.length, 2);
  assert.match(result.missed[0].text, /JPG/);
  assert.match(result.missed[1].text, /25MB/);
});

test('mixed batches retain valid photos and accurately count each skipped photo', () => {
  const valid = photo('dress.jpg', 'image/jpeg', 9 * 1024 * 1024);
  const invalid = photo('file.pdf', 'application/pdf', 1234);
  const result = classifyPhotoFiles([valid, invalid]);
  assert.deepEqual(result.accepted, [valid]);
  assert.equal(result.total, 2);
  assert.deepEqual(result.missed.map((m) => m.file), [invalid]);
});
