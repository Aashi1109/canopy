import Image from "next/image";
import { AppContainer, Caption, Display, Lead, Overline } from "@/components/ui/index.tsx";

export function CatalogHero({ suite }: { suite: "media" | "devtools" }) {
  const isMedia = suite === "media";
  return (
    <section className="bg-muted/50">
      <AppContainer className="grid items-center gap-6 px-6 py-8 sm:px-8 md:grid-cols-2 md:gap-8 lg:px-16">
        <div className="min-w-0 text-left max-md:text-center">
          <Overline className="block text-primary">{isMedia ? "Media" : "Developer tools"}</Overline>
          <Display
            className={`mt-3 text-[2.5rem] leading-[1.05] tracking-tight lg:text-[3.25rem] ${isMedia ? "" : "max-md:whitespace-nowrap max-md:text-[clamp(1rem,4.8vw,2rem)]"}`}
          >
            {isMedia ? "Your files." : "Your workflow."}{" "}
            <span className={`mt-3 block text-primary ${isMedia ? "" : "max-md:mt-0 max-md:inline"}`}>
              On your terms.
            </span>
          </Display>
          <Lead className="mt-4 text-[1.0625rem] leading-relaxed text-muted-foreground">
            {isMedia
              ? "Edit images, organize PDFs, and make files smaller."
              : "Format, compare, convert, and inspect your data."}
            <br className="hidden lg:block" />{" "}
            {isMedia
              ? "Everyday media tasks, handled in your browser."
              : "Everyday developer tasks, without the busywork."}
          </Lead>
          <Caption className="mt-3 block text-muted-foreground">
            {isMedia ? "Your files stay on this device." : "Core tools process your content on this device."}
          </Caption>
        </div>
        <Image
          alt=""
          className="mx-auto h-auto w-full max-w-[560px]"
          height={isMedia ? 1572 : 1617}
          loading="eager"
          sizes="(min-width: 1280px) 560px, (min-width: 768px) 46vw, 90vw"
          src={`/assets/${suite}-illustration@4x.png`}
          width={2428}
        />
      </AppContainer>
    </section>
  );
}
