import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";

export default function BlogLoading() {
  const t = useTranslations("Blog");
  return (
    <div
      role="status"
      className="mx-auto flex max-w-7xl items-center justify-center gap-3 px-5 py-20 text-muted-foreground"
    >
      <LoaderCircle aria-hidden="true" className="size-5 animate-spin motion-reduce:animate-none" />
      {t("loadingStories")}
    </div>
  );
}
