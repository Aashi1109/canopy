import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { transformSync } from "next/dist/build/swc/index.js";
import { DEFAULT_AUTH_ERROR } from "../app/auth/_lib/security.ts";

const state = { values: [], index: 0, toasts: [], calls: [] };
globalThis.__authFeedbackTest = state;
const stub = (source) => ({ shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(source)}` });
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (!context.parentURL?.endsWith("/AuthPanel.tsx")) return next(specifier, context);
    if (specifier === "react")
      return stub(`
      const s = globalThis.__authFeedbackTest;
      export function useId() { return 'auth-test'; }
      export function useState(initial) {
        const i = s.index++;
        if (!(i in s.values)) s.values[i] = initial;
        return [s.values[i], value => { s.values[i] = typeof value === 'function' ? value(s.values[i]) : value; }];
      }
    `);
    if (specifier === "@/components/ui/index.tsx")
      return stub(`
      export const toast = {success(message) {globalThis.__authFeedbackTest.toasts.push(message);}};
      ${["Caption", "Label", "H1", "P", "Strong", "Text", "TextLink", "AlertBanner", "Button", "Card", "CheckboxControl", "Field", "FieldLegend", "FieldSet", "Input", "Separator"].map((name) => `export const ${name} = '${name}';`).join("\n")}
    `);
    if (specifier === "./_lib/authClient")
      return stub(`
      const request = async body => {
        const s = globalThis.__authFeedbackTest;
        s.calls.push(body);
        return s.respond();
      };
      export const authClient = {signUp: {email: request}, signIn: {email: request, social: request}, requestPasswordReset: request, sendVerificationEmail: request};
    `);
    if (specifier === "./_lib/security") return next(`${specifier}.ts`, context);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (!url.endsWith("/AuthPanel.tsx")) return next(url, context);
    return {
      format: "module",
      shortCircuit: true,
      source: transformSync(readFileSync(new URL(url), "utf8"), {
        filename: new URL(url).pathname,
        jsc: { parser: { syntax: "typescript", tsx: true }, transform: { react: { runtime: "automatic" } } },
        module: { type: "es6" },
      }).code,
    };
  },
});
const { AuthPanel } = await import("../app/auth/AuthPanel.tsx");
hooks.deregister();
test.after(() => {
  delete globalThis.__authFeedbackTest;
});

const walk = (node) =>
  Array.isArray(node)
    ? node.flatMap(walk)
    : node?.props
      ? [node, ...walk(node.props.children), ...walk(node.props.action)]
      : [];
const text = (node) =>
  Array.isArray(node)
    ? node.map(text).join("")
    : node?.props
      ? text(node.props.children)
      : typeof node === "string"
        ? node
        : "";

test("auth successes toast while verification stays actionable, and failures remain safe and retryable", async (t) => {
  t.mock.method(globalThis, "FormData", function (form) {
    return form;
  });
  const event = {
    preventDefault() {},
    currentTarget: new Map([
      ["name", "Test User"],
      ["email", "USER@example.test"],
      ["password", "test-password-123"],
    ]),
  };
  let mode;
  const render = () => {
    state.index = 0;
    return walk(AuthPanel({ returnTo: "/paperwork", initialMode: mode }));
  };
  const button = (label) => render().find((node) => ["Button", "button"].includes(node.type) && text(node) === label);
  const alerts = () => render().filter((node) => node.type === "AlertBanner");
  const submit = () =>
    render()
      .find((node) => node.type === "form")
      .props.onSubmit(event);
  function reset(nextMode) {
    mode = nextMode;
    Object.assign(state, { values: [], toasts: [], calls: [], respond: async () => ({ error: null }) });
    if (mode === "sign-up")
      render()
        .find((node) => node.type === "CheckboxControl")
        .props.onCheckedChange(true);
  }
  const assertRetryable = () => {
    assert.equal(
      render().find((node) => node.type === "FieldSet")?.props.disabled ?? button("Resend email")?.props.disabled,
      false,
    );
    assert.equal(state.toasts.length, 0);
    assert.equal(text(alerts().find((node) => node.props.variant === "error")), DEFAULT_AUTH_ERROR);
  };

  reset("sign-up");
  await submit();
  assert.equal(state.toasts.length, 1);
  assert.equal(
    alerts().some((node) => node.props.variant === "success"),
    false,
  );
  assert.match(text(render()[0]), /user@example\.test/);
  assert.equal(
    render().some((node) => node.type === "form"),
    false,
  );
  assert.equal(button("Create account"), undefined);
  assert.equal(button("Sign up with Google"), undefined);
  state.toasts = [];
  assert.equal(button("Resend email").props.disabled, false);
  await button("Resend email").props.onClick();
  assert.equal(state.toasts.length, 1);
  assert.equal(state.calls.at(-1).email, "user@example.test");

  for (const respond of [
    async () => ({ error: { message: "private backend details" } }),
    async () => {
      throw new Error("private backend details");
    },
  ]) {
    state.respond = respond;
    state.toasts = [];
    await button("Resend email").props.onClick();
    assertRetryable();
    assert.equal(button("Resend email").props.disabled, false);
  }
  button("Sign in").props.onClick();
  assert.equal(button("Resend email"), undefined);
  assert.equal(alerts().length, 0);

  reset("forgot");
  await submit();
  assert.equal(state.toasts.length, 1);
  assert.equal(alerts().length, 0);

  for (const nextMode of ["forgot", "sign-up", "sign-in"]) {
    for (const reject of [false, true]) {
      reset(nextMode);
      state.respond = async () => {
        if (reject) throw new Error("private backend details");
        return { error: { message: "private backend details" } };
      };
      await submit();
      assertRetryable();
    }
  }
  reset("sign-in");
  state.respond = async () => {
    throw new Error("private backend details");
  };
  await button("Continue with Google").props.onClick();
  assertRetryable();

  reset("sign-in");
  state.respond = async () => ({ error: { code: "EMAIL_NOT_VERIFIED" } });
  await submit();
  assert.equal(state.toasts.length, 0);
  assert.equal(button("Resend email").props.disabled, false);
  assert.equal(
    render().some((node) => node.type === "form"),
    false,
  );
  button("Sign in").props.onClick();
  assert.equal(
    render().some((node) => node.type === "form"),
    true,
  );
});
