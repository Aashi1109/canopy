import { CanopyFooter } from "@/components/canopy/CanopyFooter";
import { getOptionalSession } from "@/lib/auth/session.ts";
import {
  Caption,
  Display,
  H2,
  H3,
  List,
  Metric,
  Muted,
  Overline,
  P,
  Text,
  TextLink,
  AccountNavigation,
  Button,
  ProductHeader,
} from "@/components/ui/index.tsx";
import { headers } from "next/headers";

const projects = [
  {
    number: "01",
    category: "Business documents",
    name: "Paperwork",
    description: "Create invoices, receipts, expense reports, tax estimates, and contractor records.",
    href: "/paperwork",
  },
  {
    number: "02",
    category: "Browser utilities",
    name: "Devtools",
    description: "Format, convert, and inspect working data with focused browser tools.",
    href: "/devtools",
  },
  {
    number: "03",
    category: "Private media processing",
    name: "Media Tools",
    description: "Convert, organize, edit, and compress images and PDFs entirely in your browser.",
    href: "/media",
  },
] as const;

export default async function HomePage() {
  const session = await getOptionalSession(await headers());

  return (
    <div className="platform-shell min-h-screen bg-background text-foreground">
      <ProductHeader
        account={{ returnTo: "/", user: session?.user ?? null }}
        actions={<AccountNavigation returnTo="/" user={session?.user ?? null} />}
        className="platform-header sticky top-0 z-50"
        href="/"
        name="SmartTools"
      />

      <main>
        <section className="overflow-hidden border-b border-border bg-card">
          <div className="mx-auto grid max-w-7xl lg:grid-cols-[minmax(0,1.08fr)_minmax(28rem,0.92fr)]">
            <div className="flex min-h-[36rem] flex-col justify-center px-4 py-16 sm:px-6 sm:py-20 lg:min-h-[44rem] lg:border-r lg:border-border lg:px-8 lg:py-24">
              <Overline className="block mb-6 text-primary">Focused utilities for everyday work</Overline>
              <Display className="max-w-4xl">
                Less time
                <br />
                between
                <br />
                <span className="text-primary">need</span>
                <br />
                and done.
              </Display>
              <Muted className="mt-8 max-w-xl text-muted-foreground">
                SmartTools brings image and PDF tools, business paperwork, and developer utilities into one clear place
                to start.
              </Muted>
              <div className="mt-9 flex flex-wrap gap-3">
                <Button asChild className="h-auto min-h-12 rounded-none px-5 hover:bg-foreground">
                  <a href={projects[0].href}>Explore Paperwork</a>
                </Button>
                <Button
                  asChild
                  className="h-auto min-h-12 rounded-none border-foreground px-5 hover:bg-foreground hover:text-card"
                  variant="outline"
                >
                  <a href={projects[1].href}>Browse Devtools</a>
                </Button>
                <Button
                  asChild
                  className="h-auto min-h-12 rounded-none border-foreground px-5 hover:bg-foreground hover:text-card"
                  variant="outline"
                >
                  <a href={projects[2].href}>Open Media Tools</a>
                </Button>
              </div>
              <Caption className="block mt-6 text-muted-foreground">
                Public tools are available without an account.
              </Caption>
            </div>

            <nav
              aria-labelledby="suite-navigation-title"
              className="platform-grid flex flex-col justify-center bg-background px-4 py-12 sm:px-6 lg:px-8 lg:py-16"
            >
              <H2 className="mb-4" id="suite-navigation-title">
                Choose a suite
              </H2>
              <List className="list-none p-0 space-y-0 border border-border bg-card">
                {projects.map((project) => (
                  <li className="border-b border-border last:border-b-0" key={project.name}>
                    <TextLink
                      className="no-underline group grid min-h-56 grid-cols-[5rem_minmax(0,1fr)] text-foreground outline-none transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:grid-cols-[6.5rem_minmax(0,1fr)]"
                      href={project.href}
                    >
                      <span
                        aria-hidden="true"
                        className="flex items-start justify-center border-r border-border px-3 py-6 text-primary transition-colors group-hover:border-white/35 group-hover:text-primary-foreground"
                      >
                        <Metric>{project.number}</Metric>
                      </span>
                      <div className="flex min-w-0 flex-col p-6">
                        <Overline className="text-muted-foreground transition-colors group-hover:text-white/70">
                          {project.category}
                        </Overline>
                        <H3 className="mt-3">{project.name}</H3>
                        <Text className="mt-4 max-w-sm text-muted-foreground transition-colors group-hover:text-white/80">
                          {project.description}
                        </Text>
                        <Text className="mt-auto pt-6 underline decoration-1 underline-offset-4">
                          Open {project.name}
                        </Text>
                      </div>
                    </TextLink>
                  </li>
                ))}
              </List>
            </nav>
          </div>
        </section>

        <section aria-labelledby="projects-title" className="border-b border-border">
          <div className="mx-auto grid max-w-7xl lg:grid-cols-[minmax(18rem,0.7fr)_minmax(0,1.3fr)]">
            <div className="border-b border-border px-4 py-12 sm:px-6 lg:border-r lg:border-b-0 lg:px-8 lg:py-20">
              <Overline className="block text-primary">What you can do</Overline>
              <H2 className="mt-5 max-w-md" id="projects-title">
                Start with the task in front of you.
              </H2>
            </div>

            <div className="grid sm:grid-cols-3">
              <article className="border-b border-border p-6 sm:border-r sm:border-b-0 lg:p-8">
                <P aria-hidden="true" className="text-primary">
                  01
                </P>
                <H3 className="mt-10">Create the document</H3>
                <Muted className="mt-3 text-muted-foreground">
                  Build invoices, receipts, expense reports, tax estimates, and contractor records in Paperwork.
                </Muted>
              </article>
              <article className="border-b border-border p-6 sm:border-r sm:border-b-0 lg:p-8">
                <P aria-hidden="true" className="text-primary">
                  02
                </P>
                <H3 className="mt-10">Process the media</H3>
                <Muted className="mt-3 text-muted-foreground">
                  Convert, organize, edit, and compress images and PDFs in Media Tools.
                </Muted>
              </article>
              <article className="p-6 lg:p-8">
                <P aria-hidden="true" className="text-primary">
                  03
                </P>
                <H3 className="mt-10">Handle the data</H3>
                <Muted className="mt-3 text-muted-foreground">
                  Format, convert, inspect, and generate developer data in Devtools.
                </Muted>
              </article>
            </div>
          </div>
        </section>
      </main>

      <CanopyFooter />
    </div>
  );
}
