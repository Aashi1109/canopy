import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'next/dist/build/swc/index.js';
import { createBlogDocument, BlogValidationError } from '../lib/blog/document.ts';

const root = new URL('../', import.meta.url);
const state = { calls: [], post: null, posts: { items: [], nextCursor: null }, categories: { items: [], nextCursor: null }, error: null, relatedError: null, pendingRead: null, hookValues: [], hookIndex: 0 };
globalThis.__publicBlogTest = state;
const stub = source => ({ shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(source)}` });
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'react' && context.parentURL?.endsWith('BlogStories.tsx?interaction')) return stub(`
      const s=globalThis.__publicBlogTest;
      export function useState(initial){const i=s.hookIndex++;if(!(i in s.hookValues))s.hookValues[i]=initial;return [s.hookValues[i],value=>{s.hookValues[i]=typeof value==='function'?value(s.hookValues[i]):value}];}
      export function useRef(initial){const i=s.hookIndex++;if(!(i in s.hookValues))s.hookValues[i]={current:initial};return s.hookValues[i];}
    `);
    if (specifier === '@/lib/blog/queries') return stub(`
      const s=globalThis.__publicBlogTest;
      export async function getPublishedBlogPost(slug){s.calls.push(['post',slug]);if(s.error)throw s.error;return s.post;}
      export async function listPublishedBlogPosts(input){s.calls.push(['posts',input]);if(s.error||s.relatedError)throw s.error||s.relatedError;if(s.pendingRead)return s.pendingRead;return s.posts;}
      export async function listPublishedBlogTaxonomy(kind,input){s.calls.push(['categories',kind,input]);if(s.error)throw s.error;return s.categories;}
    `);
    if (specifier === 'next/navigation') return stub('export function notFound(){throw new Error("TEST_NOT_FOUND")}');
    if (specifier.startsWith('@/')) specifier = new URL(specifier.slice(2), root).href;
    if ((specifier.startsWith('.') || specifier.startsWith('file:')) && context.parentURL?.startsWith('file:') && !context.parentURL.includes('/node_modules/')) {
      const target = new URL(specifier, context.parentURL);
      for (const extension of ['', '.ts', '.tsx']) {
        const file = new URL(target.href + extension);
        if (existsSync(file)) return next(file.href, context);
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('.css')) return { format: 'module', shortCircuit: true, source: 'export default {body:"article-body"};' };
    if (url.endsWith('.png')) return { format: 'module', shortCircuit: true, source: 'export default {src:"/test-logo.png"};' };
    if (!new URL(url).pathname.endsWith('.tsx')) return next(url, context);
    return { format: 'module', shortCircuit: true, source: transformSync(readFileSync(new URL(url), 'utf8'), {
      filename: new URL(url).pathname,
      jsc: { parser: { syntax: 'typescript', tsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'es6' },
    }).code };
  },
});
const listing = await import('../app/blog/page.tsx');
const article = await import('../app/blog/[slug]/page.tsx');
const { BlogArticle } = await import('../components/blog/BlogArticle.tsx');
const { BlogStories: InteractiveStories } = await import('../app/blog/components/BlogStories.tsx?interaction');
const { loadMoreBlogPosts } = await import('../app/blog/actions.ts');
const { parseBlogFilters } = await import('../app/blog/lib/filters.ts');
const { listPublishedBlogPosts: realPublishedQuery, encodeBlogCursor } = await import('../lib/blog/queries.ts');
const { db } = await import('../packages/database/src/index.ts');
test.after(() => { hooks.deregister(); delete globalThis.__publicBlogTest; });

function reset() {
  state.calls = []; state.error = null; state.relatedError = null; state.post = null;
  state.pendingRead = null; state.hookValues = []; state.hookIndex = 0;
  state.posts = { items: [], nextCursor: null };
  state.categories = { items: [], nextCursor: null };
}
function published() {
  const document = { ...createBlogDocument('Live <script>title</script>'), excerpt: 'Published summary', category: { id: 'cat', label: 'Guides' }, body: { type: 'doc', content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'First steps' }] },
    { type: 'paragraph', content: [{ type: 'text', text: '<script>unsafe()</script>' }] },
  ] } };
  return { id: 'live', slug: 'live-story', document, category: { id: 'cat', label: 'Guides', slug: 'guides' }, tags: [{ id: 'tag', label: 'PDF', slug: 'pdf' }], relatedToolLinks: [{ id: 'tool', name: 'PDF tool', href: '/media/pdf-tool' }], firstPublishedAt: new Date('2026-09-16T10:00:00Z'), publishedUpdatedAt: new Date('2026-09-16T11:00:00Z') };
}
const summary = post => ({ ...post, ...post.document });

test('public listing renders published summaries and keeps filters in next and clear-search links', async () => {
  reset();
  state.posts = { items: [summary(published())], nextCursor: 'next-page' };
  state.categories = { items: [{ id: 'cat', name: 'Guides', slug: 'guides' }], nextCursor: null };
  const html = renderToStaticMarkup(await listing.default({ searchParams: Promise.resolve({ search: 'PDF & docs', category: 'guides', tag: 'pdf', cursor: 'previous' }) }));
  assert.deepEqual(state.calls[0], ['posts', { search: 'PDF & docs', category: 'guides', tag: 'pdf', cursor: 'previous' }]);
  assert.match(html, /href="\/blog\/live-story"/);
  assert.match(html, /search=PDF\+%26\+docs&amp;category=guides&amp;tag=pdf&amp;cursor=next-page/);
  assert.match(html, /href="\/blog\?category=guides&amp;tag=pdf">Clear search/);
  assert.doesNotMatch(html, /<script>title|unsafe\(\)/);
  assert.ok(state.calls.every(([name]) => ['posts', 'categories'].includes(name)));
});

test('empty blog has recovery and categories beyond the first page remain reachable', async () => {
  reset();
  state.categories = { items: Array.from({ length: 25 }, (_, i) => ({ id: `cat-${i}`, name: `Topic ${i}`, slug: `topic-${i}` })), nextCursor: 'more-topics' };
  const html = renderToStaticMarkup(await listing.default({ searchParams: Promise.resolve({}) }));
  assert.match(html, /Stories are on the way/);
  assert.match(html, /href="\/"[^>]*>Explore tools/);
  assert.match(html, /categoryCursor=more-topics/);
  assert.match(html, /category=topic-24/);
});

test('malformed listing inputs do not reach queries and invalid cursors recover through not-found', async () => {
  reset();
  await assert.rejects(listing.default({ searchParams: Promise.resolve({ search: ['a', 'b'] }) }), /TEST_NOT_FOUND/);
  assert.equal(state.calls.length, 0);
  state.error = new BlogValidationError('Invalid blog pagination cursor.');
  await assert.rejects(listing.default({ searchParams: Promise.resolve({ cursor: 'bad' }) }), /TEST_NOT_FOUND/);
  state.error = new Error('Database unavailable');
  await assert.rejects(listing.default({ searchParams: Promise.resolve({}) }), /Database unavailable/);
});

test('article renders safe live content, heading destinations, tools, tags, metadata and JSON-LD', async () => {
  reset(); state.post = published(); state.posts = { items: [summary(state.post)], nextCursor: null };
  const html = renderToStaticMarkup(await article.default({ params: Promise.resolve({ slug: 'live-story' }) }));
  assert.match(html, /href="#heading-1"/);
  assert.match(html, /<h2 id="heading-1">First steps<\/h2>/);
  assert.match(html, /&lt;script&gt;unsafe\(\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>unsafe/);
  assert.match(html, /href="\/media\/pdf-tool"/);
  assert.match(html, /href="\/blog\?tag=pdf"/);
  const json = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(json.headline, state.post.document.title);
  assert.equal(json.dateModified, '2026-09-16T11:00:00.000Z');
  const metadata = await article.generateMetadata({ params: Promise.resolve({ slug: 'live-story' }) });
  assert.equal(metadata.openGraph.type, 'article');
  assert.match(metadata.alternates.canonical, /\/blog\/live-story$/);
  assert.deepEqual(state.calls.filter(([name]) => name === 'posts'), [['posts', { category: 'guides' }]]);
});

test('private preview shares safe article presentation without public share links or publication metadata', () => {
  const html = renderToStaticMarkup(createElement(BlogArticle, { document: published().document }));
  assert.match(html, /<h2 id="heading-1">First steps<\/h2>/);
  assert.doesNotMatch(html, /Copy link|application\/ld\+json|dateTime=|href="\/blog\//);
});

test('a failure loading optional related stories does not hide the published article', async () => {
  reset(); state.post = published(); state.relatedError = new Error('Related query unavailable');
  const html = renderToStaticMarkup(await article.default({ params: Promise.resolve({ slug: 'live-story' }) }));
  assert.match(html, /<h2 id="heading-1">First steps<\/h2>/);
  assert.doesNotMatch(html, /Related query unavailable/);
});

test('missing and malformed article slugs return not-found without leaking unpublished content', async () => {
  reset();
  await assert.rejects(article.default({ params: Promise.resolve({ slug: '../draft' }) }), /TEST_NOT_FOUND/);
  assert.equal(state.calls.length, 0);
  await assert.rejects(article.default({ params: Promise.resolve({ slug: 'unpublished' }) }), /TEST_NOT_FOUND/);
  assert.deepEqual(state.calls, [['post', 'unpublished']]);
});

test('filtered listing metadata does not create duplicate indexed search pages', async () => {
  const metadata = await listing.generateMetadata({ searchParams: Promise.resolve({ search: 'invoice' }) });
  assert.equal(metadata.robots.index, false);
  assert.equal(metadata.alternates.canonical, '/blog');
  assert.equal(metadata.alternates.types['application/rss+xml'], '/blog/feed.xml');
});

test('load-more preserves loaded stories on failure, retries the same cursor, and appends unique stories', async () => {
  reset();
  const first = summary(published());
  const second = { ...first, id: 'second', slug: 'second-story', title: 'Second story' };
  const props = { initialPage: { items: [first], nextCursor: 'page-2' }, filters: { category: 'guides', search: 'PDF' }, intro: null, emptyState: null, topics: null };
  const render = () => { state.hookIndex = 0; return InteractiveStories(props); };
  function findNext(element) {
    if (!element || typeof element !== 'object') return undefined;
    if (element.type === 'a' && element.props.rel === 'next') return element;
    const children = element.props?.children;
    return (Array.isArray(children) ? children.flat(Infinity) : [children]).map(findNext).find(Boolean);
  }
  const click = element => element.props.onClick({ button: 0, preventDefault() {}, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false });
  let resolveRead;
  state.pendingRead = new Promise(resolve => { resolveRead = resolve; });
  click(findNext(render()));
  click(findNext(render()));
  assert.equal(state.calls.length, 1, 'a pending read cannot be submitted twice');
  assert.match(renderToStaticMarkup(render()), /aria-busy="true"/);
  resolveRead({ items: [first, second, second], nextCursor: 'page-3' });
  await new Promise(setImmediate);
  state.pendingRead = null;
  let html = renderToStaticMarkup(render());
  assert.equal((html.match(/href="\/blog\/second-story"/g) ?? []).length, 1);
  assert.match(html, /1 more story loaded/);
  state.error = new Error('postgres://private-password');
  click(findNext(render()));
  await new Promise(setImmediate);
  html = renderToStaticMarkup(render());
  assert.match(html, /href="\/blog\/second-story"/);
  assert.match(html, /Try loading more/);
  assert.doesNotMatch(html, /private-password/);
  assert.match(findNext(render()).props.href, /cursor=page-3/);
  state.error = null; state.posts = { items: [], nextCursor: null };
  click(findNext(render()));
  await new Promise(setImmediate);
  assert.equal(findNext(render()), undefined);
  assert.match(renderToStaticMarkup(render()), /You’re up to date/);
  assert.deepEqual(state.calls.map(([, input]) => input.cursor), ['page-2', 'page-3', 'page-3']);
  assert.ok(state.calls.every(([, input]) => input.category === 'guides' && input.search === 'PDF'));
});

test('public load-more action returns only published query data and safe actionable failures', async () => {
  reset(); state.posts = { items: [summary(published())], nextCursor: null };
  const result = await loadMoreBlogPosts({ category: 'guides', cursor: 'page-2' });
  assert.equal(result.ok, true);
  assert.deepEqual(state.calls, [['posts', { category: 'guides', cursor: 'page-2' }]]);
  state.error = new BlogValidationError('Secret internal detail');
  const invalid = await loadMoreBlogPosts({ cursor: 'invalid' });
  assert.equal(invalid.ok, false);
  assert.match(invalid.message, /Refresh the blog/);
  assert.doesNotMatch(invalid.message, /Secret internal detail/);
});

test('load-more excludes taxonomy pagination fields from the real strict public query boundary', async () => {
  reset();
  const cursor = encodeBlogCursor({ kind: 'published', value: '2026-09-16T10:00:00.000001Z', id: 'live' });
  const filters = parseBlogFilters({ search: 'PDF', category: 'guides', categoryCursor: 'taxonomy-only' });
  const props = { initialPage: { items: [summary(published())], nextCursor: cursor }, filters, intro: null, emptyState: null, topics: null };
  state.hookIndex = 0;
  const tree = InteractiveStories(props);
  function visit(element) {
    if (!element || typeof element !== 'object') return undefined;
    if (element.type === 'a' && element.props.rel === 'next') return element;
    const children = element.props?.children;
    return (Array.isArray(children) ? children.flat(Infinity) : [children]).map(visit).find(Boolean);
  }
  visit(tree).props.onClick({ button: 0, preventDefault() {} });
  await new Promise(setImmediate);
  const payload = state.calls[0][1];
  assert.equal(Object.hasOwn(payload, 'categoryCursor'), false);
  const original = db.select;
  let reads = 0;
  const chain = { from: () => chain, innerJoin: () => chain, where: () => chain, orderBy: () => chain, limit: async () => [] };
  db.select = () => { reads++; return chain; };
  try {
    assert.deepEqual(await realPublishedQuery(payload), { items: [], nextCursor: null });
    assert.equal(reads, 1);
    await assert.rejects(realPublishedQuery({ ...payload, categoryCursor: undefined }));
    assert.equal(reads, 1, 'an unknown field is rejected before opening a database query');
  } finally { db.select = original; }
});
