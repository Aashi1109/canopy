import type { ComponentProps } from "react";
import { AppContainer } from "@smarttools/ui";

/** Shared page edges for the blog listing, articles, and private previews. */
export function BlogPageContainer({
  className = "",
  children,
  ...props
}: ComponentProps<typeof AppContainer>) {
  return (
    <AppContainer className="@container/blog-page max-w-[1440px] px-0 lg:px-0" {...props}>
      <div
        className={`px-5 @min-[640px]/blog-page:px-8 @min-[1024px]/blog-page:px-20 ${className}`}
      >
        {children}
      </div>
    </AppContainer>
  );
}
