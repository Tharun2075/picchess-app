import test from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'app', 'models');

test('squares-screen.onnx exists, is small and has an ONNX header', () => {
  const buf = fs.readFileSync(path.join(dir, 'squares-screen.onnx'));
  assert.ok(buf.length > 0 && buf.length <= 8 * 1024 * 1024, `size ${buf.length}`);
  assert.strictEqual(buf[0], 0x08, 'field 1 (ir_version) varint tag');
  assert.ok(buf[1] > 0 && buf[1] < 0x80, 'ir_version is a small varint');
});

test('squares-screen.json lists 13 classes and matches the file', () => {
  const j = JSON.parse(fs.readFileSync(path.join(dir, 'squares-screen.json'), 'utf8'));
  assert.strictEqual(j.classes.length, 13);
  assert.strictEqual(j.classes.join(''), '1KQRBNPkqrbnp');
  const buf = fs.readFileSync(path.join(dir, 'squares-screen.onnx'));
  assert.strictEqual(crypto.createHash('sha256').update(buf).digest('hex'), j.sha256);
  assert.strictEqual(buf.length, j.bytes);
});
