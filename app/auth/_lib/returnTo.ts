import config from "@canopy/config";
import { resolveReturnTo } from "./security.ts";

export function resolveConfiguredReturnTo(value: string | null | undefined): string {
  return resolveReturnTo(value, {
    baseURL: config.appUrl,
    fallback: "/",
  });
}
