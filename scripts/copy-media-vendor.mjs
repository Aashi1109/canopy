import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const qpdfRoot = dirname(fileURLToPath(import.meta.resolve("qpdf-wasm")));
const heicRoot = dirname(fileURLToPath(import.meta.resolve("heic-to")));
const qpdfTarget = join(appRoot, "public/media/vendor/qpdf");
const licenseTarget = join(appRoot, "public/media/vendor/licenses");

await Promise.all([mkdir(qpdfTarget, { recursive: true }), mkdir(licenseTarget, { recursive: true })]);
await Promise.all([
  copyFile(join(qpdfRoot, "qpdf.js"), join(qpdfTarget, "qpdf.js")),
  copyFile(join(qpdfRoot, "qpdf.wasm"), join(qpdfTarget, "qpdf.wasm")),
  copyFile(join(heicRoot, "../LICENSE"), join(licenseTarget, "heic-to-LGPL-3.0.txt")),
]);
