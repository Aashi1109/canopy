import { LoaderCircle } from "lucide-react";

export default function BlogLoading() {
  return (
    <div
      role="status"
      className="mx-auto flex max-w-7xl items-center justify-center gap-3 px-5 py-20 text-muted-foreground"
    >
      <LoaderCircle aria-hidden="true" className="size-5 animate-spin motion-reduce:animate-none" />
      Loading stories…
    </div>
  );
}
