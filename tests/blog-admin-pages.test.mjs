import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'next/dist/build/swc/index.js';

const root = new URL('../', import.meta.url);
const settingsState = { values: [], index: 0 };
globalThis.__blogSettingsTest = settingsState;
const stub = source => ({ shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(source)}` });
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'react' && context.parentURL?.endsWith('/BlogPostSettings.tsx')) return stub(`
      export function useState(initial) {
        const state = globalThis.__blogSettingsTest;
        const index = state.index++;
        if (!(index in state.values)) state.values[index] = initial;
        return [state.values[index], value => { state.values[index] = value; }];
      }
    `);
    if (specifier === 'next/link') return next('next/link.js', context);
    if (specifier === 'next/navigation') return stub('export function useRouter(){return {push(){},refresh(){}}} export function notFound(){throw Error("NOT_FOUND")}');
    if (specifier === '@/lib/admin/access') return stub('export async function requirePagePermission(){return {user:{id:"admin"}}}');
    if (specifier === '@/lib/blog/queries') return stub('export async function listBlogTaxonomy(){return {items:[],nextCursor:"next-page"}}');
    if (specifier === '../actions') return stub('export async function mutateBlogAction(){throw Error("Unexpected mutation")} export async function readBlogAction(){throw Error("Unexpected query")}');
    if (specifier.startsWith('@/')) specifier = new URL(specifier.slice(2), root).href;
    if ((specifier.startsWith('.') || specifier.startsWith('file:')) && context.parentURL?.startsWith('file:') && !context.parentURL.includes('/node_modules/')) {
      const target = new URL(specifier, context.parentURL);
      for (const extension of ['', '.ts', '.tsx']) if (existsSync(new URL(target.href + extension))) return next(target.href + extension, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('.css')) return { format: 'module', shortCircuit: true, source: 'export default new Proxy({}, { get: (_, name) => String(name) });' };
    if (url.endsWith('.png')) return { format: 'module', shortCircuit: true, source: 'export default {src:"/test-logo.png"};' };
    if (!url.endsWith('.tsx')) return next(url, context);
    return { format: 'module', shortCircuit: true, source: transformSync(readFileSync(new URL(url), 'utf8'), {
      filename: new URL(url).pathname, jsc: { parser: { syntax: 'typescript', tsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'es6' },
    }).code };
  },
});
const { BlogPosts } = await import('../app/admin/(protected)/blog/components/BlogPosts.tsx');
const { BlogPublishPanel } = await import('../app/admin/(protected)/blog/components/BlogPublishPanel.tsx');
const { BlogPostSettings, filterRelatedTools } = await import('../app/admin/(protected)/blog/components/BlogPostSettings.tsx');
const { historyPageSchema } = await import('../app/admin/(protected)/blog/components/BlogHistoryPanel.tsx');
const taxonomy = await import('../app/admin/(protected)/blog/taxonomy/page.tsx');
test.after(() => { hooks.deregister(); delete globalThis.__blogSettingsTest; });

test('post URL copies the full address and recovers from clipboard failure without changing the draft', async (t) => {
  settingsState.values = [];
  const props = { value: { authorName: '', categoryId: '', tagIds: [], excerpt: '', seoTitle: '', seoDescription: '', relatedToolIds: [] }, slug: 'my-post', categories: [], tags: [], tools: [], disabled: true, onChange() { assert.fail('Copying must not edit the draft'); } };
  const written = [];
  globalThis.window = { location: { origin: 'https://example.test' } };
  navigator.clipboard = { async writeText(url) { written.push(url); } };
  t.after(() => { delete globalThis.window; delete navigator.clipboard; });
  function walk(node) { return Array.isArray(node) ? node.flatMap(walk) : node && typeof node === 'object' && node.props ? [node, ...walk(node.props.children)] : []; }
  function render() { settingsState.index = 0; return walk(BlogPostSettings(props)); }
  const copy = nodes => nodes.find(node => node.props.action === 'copy');

  await copy(render()).props.onClick();
  assert.deepEqual(written, ['https://example.test/blog/my-post']);
  assert.ok(render().some(node => node.props.role === 'status' && node.props.children === 'URL copied.'));

  navigator.clipboard.writeText = async () => { throw new Error('Permission denied'); };
  await copy(render()).props.onClick();
  assert.ok(render().some(node => node.props.children === 'https://example.test/blog/my-post'));
  assert.ok(render().some(node => node.props.role === 'status' && /copy it manually/.test(node.props.children)));

  navigator.clipboard.writeText = async url => { written.push(url); };
  await copy(render()).props.onClick();
  assert.equal(written.length, 2);
  assert.ok(render().some(node => node.props.role === 'status' && node.props.children === 'URL copied.'));

  props.slug = null;
  assert.equal(copy(render()), undefined);
});

test('history panel accepts paginated revision responses and rejects malformed data', () => {
  const revision = { id: 'revision-1', revisionNumber: 1, title: 'Saved draft', reason: 'manual_save', createdAt: '2026-09-16T10:00:00Z' };
  const page = historyPageSchema.parse({ items: [revision], nextCursor: 'older' });
  assert.equal(page.items[0].createdAt.getTime(), Date.parse(revision.createdAt));
  assert.equal(page.nextCursor, 'older');
  assert.deepEqual(historyPageSchema.parse({ items: [], nextCursor: null }), { items: [], nextCursor: null });
  assert.equal(historyPageSchema.safeParse({ items: [{ ...revision, createdAt: 'invalid' }], nextCursor: null }).success, false);
  assert.equal(historyPageSchema.safeParse({ items: [{ id: 'category', name: 'News' }], nextCursor: null }).success, false);
});

test('related tool search ignores case and surrounding whitespace without changing the catalog', () => {
  const tools = Object.freeze([
    Object.freeze({ id: 'json', name: 'JSON Formatter' }),
    Object.freeze({ id: 'api', name: 'API Key Generator' }),
    Object.freeze({ id: 'uuid', name: 'UUID Generator' }),
  ]);
  assert.deepEqual(filterRelatedTools(tools, '  gEnErAtOr  '), [tools[1], tools[2]]);
  assert.deepEqual(filterRelatedTools(tools, 'json'), [tools[0]]);
  assert.deepEqual(filterRelatedTools(tools, 'not a tool'), []);
  assert.deepEqual(filterRelatedTools(tools, ''), tools);
  assert.deepEqual(filterRelatedTools(tools, '   '), tools);
  assert.deepEqual(filterRelatedTools([], 'json'), []);
});

test('a published article with a scheduled revision exposes both live and scheduled states', () => {
  const html = renderToStaticMarkup(createElement(BlogPosts, { posts: [{ id: 'post', title: 'Live article', version: 1, updatedAt: new Date('2026-09-16T10:00:00Z'), publishedRevisionId: 'live', trashedAt: null, hasUnpublishedChanges: true, schedule: { scheduledAt: new Date('2026-09-17T10:00:00Z'), lastErrorCode: 'RETRY' } }], categories: { items: [], nextCursor: null }, filters: {}, nextCursor: null, canCreate: false, canArchive: false, canManageTerms: false }));
  assert.match(html, /Update scheduled/);
  assert.match(html, /Current article is live/);
  assert.match(html, /Publishing delayed/);
});

test('taxonomy keeps the originating editor across topic type and pagination changes', async () => {
  const html = renderToStaticMarkup(await taxonomy.default({ searchParams: Promise.resolve({ returnTo: '/admin/blog/post-1', cursor: 'older' }) }));
  assert.match(html, /href="\/admin\/blog\/post-1"/);
  assert.match(html, /kind=tag&amp;returnTo=%2Fadmin%2Fblog%2Fpost-1/);
  assert.match(html, /kind=category&amp;returnTo=%2Fadmin%2Fblog%2Fpost-1&amp;cursor=next-page/);
});

test('taxonomy rejects external, traversing, and repeated return destinations', async () => {
  for (const returnTo of ['https://attacker.invalid', '//attacker.invalid', '/admin/blog/../../outside', ['/admin/blog/post-1']]) {
    const html = renderToStaticMarkup(await taxonomy.default({ searchParams: Promise.resolve({ returnTo }) }));
    assert.doesNotMatch(html, /attacker|outside|returnTo=/);
    assert.match(html, /href="\/admin\/blog"/);
  }
});

test('publication recovery selects the first failed requirement and blocks publishing', () => {
  const fixed = [];
  const element = BlogPublishPanel({ mode: 'now', onModeChange() {}, schedule: { date: '', time: '09:00', timezone: 'UTC' }, onScheduleChange() {}, timezones: ['UTC'], checks: [{ id: 'title', label: 'Article title', valid: true }, { id: 'excerpt', label: 'Article excerpt', valid: false }, { id: 'category', label: 'Category', valid: false }], searchPreview: { title: 'Title', description: '', url: '/blog/post' }, onEditSeo() {}, onBack() {}, onSubmit() { assert.fail('Invalid publication must not submit'); }, onFixCheck: id => fixed.push(id), canPublish: true });
  function walk(node) { return Array.isArray(node) ? node.flatMap(walk) : node && typeof node === 'object' && node.props ? [node, ...walk(node.props.children)] : []; }
  const action = walk(element).find(node => Array.isArray(node.props.children) && node.props.children[0] === 'Fix ');
  action.props.onClick(); assert.deepEqual(fixed, ['excerpt']);
  element.props.onSubmit({ preventDefault() {} });
  assert.match(renderToStaticMarkup(element), /type="submit"[^>]*disabled=""/);
});
