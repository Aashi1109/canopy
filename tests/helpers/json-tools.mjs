export const context = (text, settings = {}, secondary = "") => ({
  input: { text, secondary, files: [] },
  settings: { repairMode: "off", ...settings },
  signal: new AbortController().signal,
});
export const execute = (run, text, settings, secondary) =>
  Promise.resolve().then(() => run(context(text, settings, secondary)));
export const content = (result) => result.text ?? result.code;
