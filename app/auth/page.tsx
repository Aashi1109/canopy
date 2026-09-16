import { DEFAULT_AUTH_ERROR, resolveConfiguredReturnTo } from "./_lib/security";
import { AuthPanel } from "./AuthPanel";
import type { AuthMode } from "./AuthPanel";
import { AuthScreen } from "./components/AuthChrome";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const authProjectPaths = {
  paperwork: "/paperwork",
  devtools: "/devtools",
  media: "/media",
} as const;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function resolveMode(value: string | undefined): AuthMode {
  if (value === "sign-up" || value === "forgot") return value;
  return "sign-in";
}

export default async function AuthPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const returnTo = resolveConfiguredReturnTo(first(params.returnTo));
  const initialError = first(params.error) ? DEFAULT_AUTH_ERROR : undefined;

  return (
    <AuthScreen projects={authProjectPaths}>
      <AuthPanel
        initialError={initialError}
        initialMode={resolveMode(first(params.mode))}
        returnTo={returnTo}
      />
    </AuthScreen>
  );
}
