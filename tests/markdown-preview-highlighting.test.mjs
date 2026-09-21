import assert from "node:assert/strict";
import test from "node:test";

import { highlightCode, createCodeHighlightBudget } from "../lib/markdown/codeHighlight.ts";
import { parseSettings } from "../lib/tool-framework/settings.ts";
import definition from "../tools/markdown-previewer/definition.ts";
import { run, renderMarkdownPreview } from "../tools/markdown-previewer/run.worker.ts";

async function preview(markdown, settings = {}) {
  const result = await run({
    input: { text: markdown },
    settings: parseSettings(definition.settings, settings),
    signal: new AbortController().signal,
  });
  assert.equal(result.render, "html");
  assert.equal(result.downloadName, "preview.html");
  return result.html;
}

function fenced(code, language = "") {
  return `\`\`\`${language}\n${code}\n\`\`\``;
}

function codeBody(html) {
  const match = html.match(/<pre><code(?: [^>]*)?>([\s\S]*?)<\/code><\/pre>/);
  assert.ok(match, "the result must contain a code block");
  return match[1];
}

function codeText(html) {
  return codeBody(html)
    .replace(/<span\b[^>]*>|<\/span>/g, "")
    .replace(/&(amp|lt|gt|quot|#39);/g, (_, entity) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[entity]);
}

test("Markdown code is highlighted with the default settings", async () => {
  const html = await preview(fenced('const answer = "ready";', "js"));
  assert.match(codeBody(html), /<span class="hljs-keyword">const<\/span>/);
  assert.match(codeBody(html), /<span class="hljs-string">/);
});

test("language aliases produce the same highlighting as the blog viewer", async (t) => {
  const cases = [
    ["javascript", "js", 'const answer = "ready"; // result'],
    ["python", "py", 'def greet(name):\n    return f"Hello {name}"'],
    ["json", "json", '{"enabled": true, "count": 42}'],
  ];
  for (const [language, alias, code] of cases) {
    await t.test(language, async () => {
      for (const label of [language, alias, alias.toUpperCase()]) {
        const html = await preview(fenced(code, label), { syntaxHighlighting: true });
        assert.equal(codeBody(html), `${highlightCode(code, language)}\n`);
        assert.match(codeBody(html), /<span class="hljs-/);
        assert.equal(codeText(html), `${code}\n`);
      }
    });
  }
});

test("unlabelled and unknown-language fences use automatic highlighting", async () => {
  const code = "def double(value):\n    return value * 2";
  for (const language of ["", "not-a-language"]) {
    const html = await preview(fenced(code, language), { syntaxHighlighting: true });
    assert.equal(codeBody(html), `${highlightCode(code)}\n`);
    assert.match(codeBody(html), /<span class="hljs-/);
  }
});

test("plain-text fences and Mermaid source remain unhighlighted", async () => {
  for (const language of ["text", "plaintext", "txt", "mermaid", "MERMAID"]) {
    const code = language.toLowerCase() === "mermaid" ? "flowchart LR\n    A --> B" : 'const text = "plain";';
    const html = await preview(fenced(code, language), { syntaxHighlighting: true });
    assert.doesNotMatch(codeBody(html), /<span\b/);
    assert.equal(codeText(html), `${code}\n`);
  }
});

test("turning highlighting off preserves the code without token markup", async () => {
  const code = 'const message = "<ready>";\n  // keep this indentation';
  const html = await preview(fenced(code, "js"), { syntaxHighlighting: false });
  assert.doesNotMatch(codeBody(html), /<span\b/);
  assert.equal(codeText(html), `${code}\n`);
});

test("highlighting preserves blank lines, tabs, and trailing spaces", async () => {
  const code = '\nfunction greet() {\n\tconst label = "hello";  \n\n\treturn label;\n}';
  const html = await preview(fenced(code, "js"), { syntaxHighlighting: true });
  assert.equal(codeText(html), `${code}\n`);
});

test("code content and language labels cannot inject HTML", async () => {
  const code = '<script>alert("x")</script>\n<img src=x onerror="alert(1)">\n& < > " \'';
  for (const language of ["html", 'js\"><img/src=x/onerror=alert(1)>']) {
    for (const syntaxHighlighting of [true, false]) {
      const html = await preview(fenced(code, language), { syntaxHighlighting });
      assert.doesNotMatch(html, /<script\b|<img\b|<svg\b|<[^>]+\sonerror=/i);
      assert.equal(codeText(html), `${code}\n`);
    }
  }
});

test("safe links remain independent of syntax highlighting", async () => {
  const markdown = `${fenced("const count = 1;", "js")}\n\n[Docs](https://example.com)`;
  for (const syntaxHighlighting of [true, false]) {
    const safe = await preview(markdown, { syntaxHighlighting, safeLinks: true });
    assert.match(safe, /<a href="https:\/\/example\.com" target="_blank" rel="noopener noreferrer">Docs<\/a>/);
    const standard = await preview(markdown, { syntaxHighlighting, safeLinks: false });
    assert.match(standard, /<a href="https:\/\/example\.com">Docs<\/a>/);
  }
});

test("large code blocks fall back to complete escaped text before expensive highlighting", () => {
  for (const [language, repetitions] of [
    [undefined, 150],
    ["unknown-language", 150],
    ["js", 2400],
  ]) {
    const code = 'const message = "<keep every line>";\n'.repeat(repetitions);
    const html = highlightCode(code, language);
    assert.doesNotMatch(html, /<span\b/);
    assert.equal(
      html,
      code.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"),
    );
  }
});

test("a shared document budget leaves later code complete when its highlighting allowance is exhausted", () => {
  const code = "const result = 42;";
  const budget = { remainingChars: code.length };
  assert.match(highlightCode(code, "js", budget), /hljs-keyword/);
  assert.equal(highlightCode(code, "js", budget), code);
  assert.match(highlightCode(code, "js", createCodeHighlightBudget()), /hljs-keyword/);
});

test("an oversized block does not spend the allowance for subsequent small code", () => {
  const budget = { remainingChars: 100 };
  const oversized = "x".repeat(70_000);
  assert.equal(highlightCode(oversized, "js", budget), oversized);
  assert.match(highlightCode("const answer = 42;", "js", budget), /hljs-keyword/);
});

test("large previews defer colors while retaining the complete document and full highlighted export", async () => {
  const source = `${"A complete paragraph.\n\n".repeat(5000)}${fenced('const last = "<preserved>";', "js")}\n\n# Final section`;
  const settings = parseSettings(definition.settings, {});
  const result = await renderMarkdownPreview(source, settings);
  assert.equal(result.deferCodeHighlighting, true);
  assert.match(result.html, /<h1>Final section<\/h1>/);
  assert.equal((result.html.match(/A complete paragraph\./g) ?? []).length, 5000);
  assert.equal(codeText(result.html), 'const last = "<preserved>";\n');
  assert.doesNotMatch(codeBody(result.html), /<span\b/);

  const exported = await renderMarkdownPreview(source, settings, { deferHighlighting: false });
  assert.equal(exported.deferCodeHighlighting, undefined);
  assert.match(codeBody(exported.html), /hljs-keyword/);
  assert.equal(codeText(exported.html), codeText(result.html));
  assert.match(exported.html, /<h1>Final section<\/h1>/);
  assert.equal((exported.html.match(/A complete paragraph\./g) ?? []).length, 5000);
});

test("disabled highlighting remains plain for large preview and explicit export requests", async () => {
  const source = `${"Paragraph.\n\n".repeat(9000)}${fenced("const value = 1;", "js")}`;
  for (const deferHighlighting of [undefined, false, true]) {
    const result = await renderMarkdownPreview(
      source,
      parseSettings(definition.settings, { syntaxHighlighting: false }),
      { deferHighlighting },
    );
    assert.equal(result.deferCodeHighlighting, undefined);
    assert.doesNotMatch(codeBody(result.html), /<span\b/);
    assert.equal(codeText(result.html), "const value = 1;\n");
  }
});

test("full exports honor the document highlighting budget without losing later code", async () => {
  const code = "const answer = 42;\n".repeat(3000);
  const source = Array.from({ length: 6 }, () => fenced(code, "js")).join("\n\n");
  const result = await renderMarkdownPreview(source, parseSettings(definition.settings, {}), {
    deferHighlighting: false,
  });
  const blocks = [...result.html.matchAll(/<pre><code(?: [^>]*)?>([\s\S]*?)<\/code><\/pre>/g)].map((match) => match[1]);
  assert.equal(blocks.length, 6);
  assert.match(blocks[0], /hljs-keyword/);
  assert.equal(blocks.at(-1), code);
  assert.equal((result.html.replace(/<[^>]*>/g, "").match(/const answer = 42;/g) ?? []).length, 18_000);
});

test("Markdown rendering rejects a canceled run before processing", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    renderMarkdownPreview("# Canceled", parseSettings(definition.settings, {}), undefined, controller.signal),
    { name: "AbortError" },
  );
});
