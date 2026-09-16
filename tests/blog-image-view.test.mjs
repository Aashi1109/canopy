import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { transformSync } from 'next/dist/build/swc/index.js';

const hooks = registerHooks({
  load(url, context, next) {
    if (url.endsWith('.css')) return { format: 'module', shortCircuit: true, source: 'export default {};' };
    if (url.endsWith('.png')) return { format: 'module', shortCircuit: true, source: 'export default {src:"/test-logo.png"};' };
    if (!url.endsWith('.tsx')) return next(url, context);
    return { format: 'module', shortCircuit: true, source: transformSync(readFileSync(new URL(url), 'utf8'), {
      filename: new URL(url).pathname, jsc: { parser: { syntax: 'typescript', tsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'es6' },
    }).code };
  },
});
const { resizedImageWidth } = await import('../app/admin/(protected)/blog/components/BlogImageView.tsx');
test.after(() => hooks.deregister());

test('image resizing follows its anchored edge and stays within the document width', () => {
  assert.equal(resizedImageWidth(50, 80, 800, 'left'), 60);
  assert.equal(resizedImageWidth(50, -80, 800, 'left'), 40);
  assert.equal(resizedImageWidth(50, 80, 800, 'center'), 70);
  assert.equal(resizedImageWidth(50, -80, 800, 'center'), 30);
  assert.equal(resizedImageWidth(50, -80, 800, 'right'), 60);
  assert.equal(resizedImageWidth(50, 80, 800, 'right'), 40);
  assert.equal(resizedImageWidth(50, 99999, 800, 'left'), 100);
  assert.equal(resizedImageWidth(50, -99999, 800, 'left'), 10);
  assert.equal(resizedImageWidth(50, 3, 800, 'left'), 50);
  assert.equal(resizedImageWidth(50, 4, 800, 'left'), 51);
  assert.equal(resizedImageWidth(50, 100, 0, 'center'), 50);
});
