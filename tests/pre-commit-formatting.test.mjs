import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("the commit hook formats staged files safely, even when advisory tests fail", (t) => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const directory = mkdtempSync(join(tmpdir(), "canopy-pre-commit-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  const run = (command, args, extraEnvironment = {}) =>
    spawnSync(command, args, {
      cwd: directory,
      env: { ...environment, pnpm_config_verify_deps_before_run: "false", ...extraEnvironment },
      encoding: "utf8",
      timeout: 30_000,
    });
  const successful = (result) => {
    assert.equal(result.error, undefined, result.stdout + result.stderr);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return result.stdout;
  };
  const git = (...args) => successful(run("git", args));
  const write = (name, content) => writeFileSync(join(directory, name), content);
  const read = (name) => readFileSync(join(directory, name), "utf8");
  const hook = (env) => run("sh", [".githooks/pre-commit"], env);
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  write(
    "package.json",
    JSON.stringify({
      private: true,
      scripts: { test: 'node -e "process.exit(process.env.FAIL_TEST ? 1 : 0)"' },
      "lint-staged": manifest["lint-staged"],
    }),
  );
  mkdirSync(join(directory, ".githooks"));
  copyFileSync(join(root, ".githooks/pre-commit"), join(directory, ".githooks/pre-commit"));
  symlinkSync(join(root, "node_modules"), join(directory, "node_modules"), "dir");
  write(".gitignore", "node_modules\n");
  for (const name of ["staged [file].js", "unrelated.js", "deleted.js", "rename.js"]) {
    write(name, "const value = 0;\n");
  }
  const context = Array.from({ length: 8 }, (_, index) => `// context ${index}\n`).join("");
  write("partial.js", `const value = 0;\n${context}const unstaged = 0;\n`);
  git("init", "--quiet");
  git("config", "user.name", "Hook test");
  git("config", "user.email", "hook-test@example.invalid");
  git("config", "commit.gpgsign", "false");
  git("config", "core.hooksPath", ".git/hooks");
  git("add", ".");
  git("commit", "--quiet", "-m", "fixture");

  const unformatted = "const value={number:1}\n";
  const formatted = "const value = { number: 1 };\n";
  write("staged [file].js", unformatted);
  write("partial.js", `${unformatted}${context}const unstaged = 0;\n`);
  write("unrelated.js", unformatted);
  write("unsupported.blob", "opaque content\n");
  git("mv", "rename.js", "renamed [file].js");
  write("renamed [file].js", unformatted);
  git("rm", "deleted.js");
  git("add", "staged [file].js", "partial.js", "unsupported.blob", "renamed [file].js");
  write("partial.js", `${unformatted}${context}const unstaged = 2;\n`);
  successful(hook());
  for (const name of ["staged [file].js", "renamed [file].js"]) {
    assert.equal(read(name), formatted);
    assert.equal(git("show", `:${name}`), formatted);
  }
  assert.equal(git("show", ":partial.js"), `${formatted}${context}const unstaged = 0;\n`);
  assert.equal(read("partial.js"), `${formatted}${context}const unstaged = 2;\n`);
  assert.equal(read("unrelated.js"), unformatted);
  assert.equal(git("show", ":unrelated.js"), "const value = 0;\n");
  assert.equal(git("show", ":unsupported.blob"), "opaque content\n");
  assert.equal(git("diff", "--cached", "--name-only", "--diff-filter=D", "--", "deleted.js"), "deleted.js\n");

  git("reset", "--hard", "HEAD");
  write("unrelated.js", unformatted);
  successful(hook());
  assert.equal(read("unrelated.js"), unformatted);
  assert.equal(git("diff", "--cached"), "");

  write("staged [file].js", unformatted);
  git("add", "staged [file].js");
  successful(hook({ FAIL_TEST: "1" }));
  assert.equal(git("show", ":staged [file].js"), formatted);
  assert.equal(read("unrelated.js"), unformatted);

  write("staged [file].js", unformatted);
  write("invalid.js", "const =\n");
  git("add", "staged [file].js", "invalid.js");
  const stagedBefore = git("diff", "--cached");
  const failed = hook();
  assert.equal(failed.error, undefined);
  assert.notEqual(failed.status, 0, failed.stdout + failed.stderr);
  assert.equal(git("diff", "--cached"), stagedBefore);
  assert.equal(read("staged [file].js"), unformatted);
  assert.equal(read("invalid.js"), "const =\n");
  assert.equal(read("unrelated.js"), unformatted);
});
