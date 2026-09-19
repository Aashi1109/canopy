import assert from "node:assert/strict";
import test from "node:test";

import { highlightBlogCode } from "../lib/blog/codeHighlight.ts";
import { parseSettings } from "../lib/tool-framework/settings.ts";
import definition from "../tools/markdown-previewer/definition.ts";
import { run } from "../tools/markdown-previewer/run.ts";

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
        assert.equal(codeBody(html), `${highlightBlogCode(code, language)}\n`);
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
    assert.equal(codeBody(html), `${highlightBlogCode(code)}\n`);
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
