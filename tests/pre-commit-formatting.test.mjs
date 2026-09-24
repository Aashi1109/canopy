import { expect, onTestFinished, test } from "vitest";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

test("the commit hook formats staged files safely, even when advisory tests fail", () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const directory = mkdtempSync(join(tmpdir(), "canopy-pre-commit-"));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  const run = (command, args, extraEnvironment = {}) =>
    spawnSync(command, args, {
      cwd: directory,
      env: { ...environment, pnpm_config_verify_deps_before_run: "false", ...extraEnvironment },
      encoding: "utf8",
      timeout: 30_000,
    });
  const successful = (result) => {
    expect(result.error, result.stdout + result.stderr).toBe(undefined);
    expect(result.status, result.stdout + result.stderr).toBe(0);
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
    expect(read(name)).toBe(formatted);
    expect(git("show", `:${name}`)).toBe(formatted);
  }
  expect(git("show", ":partial.js")).toBe(`${formatted}${context}const unstaged = 0;\n`);
  expect(read("partial.js")).toBe(`${formatted}${context}const unstaged = 2;\n`);
  expect(read("unrelated.js")).toBe(unformatted);
  expect(git("show", ":unrelated.js")).toBe("const value = 0;\n");
  expect(git("show", ":unsupported.blob")).toBe("opaque content\n");
  expect(git("diff", "--cached", "--name-only", "--diff-filter=D", "--", "deleted.js")).toBe("deleted.js\n");

  git("reset", "--hard", "HEAD");
  write("unrelated.js", unformatted);
  successful(hook());
  expect(read("unrelated.js")).toBe(unformatted);
  expect(git("diff", "--cached")).toBe("");

  write("staged [file].js", unformatted);
  git("add", "staged [file].js");
  successful(hook({ FAIL_TEST: "1" }));
  expect(git("show", ":staged [file].js")).toBe(formatted);
  expect(read("unrelated.js")).toBe(unformatted);

  write("staged [file].js", unformatted);
  write("invalid.js", "const =\n");
  git("add", "staged [file].js", "invalid.js");
  const stagedBefore = git("diff", "--cached");
  const failed = hook();
  expect(failed.error).toBe(undefined);
  expect(failed.status, failed.stdout + failed.stderr).not.toBe(0);
  expect(git("diff", "--cached")).toBe(stagedBefore);
  expect(read("staged [file].js")).toBe(unformatted);
  expect(read("invalid.js")).toBe("const =\n");
  expect(read("unrelated.js")).toBe(unformatted);
}, 120000);
