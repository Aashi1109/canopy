import { resolveConfiguredReturnTo } from "../_lib/security";
import { AuthScreen } from "../components/AuthChrome";
import { ResetPasswordForm } from "./ResetPasswordForm";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ResetPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const returnTo = resolveConfiguredReturnTo(first(params.returnTo));

  return (
    <AuthScreen>
      <ResetPasswordForm returnTo={returnTo} token={first(params.token)} />
    </AuthScreen>
  );
}
