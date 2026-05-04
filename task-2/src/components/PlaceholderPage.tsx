import { ReactNode } from "react";
import { PageMeta } from "@/components/PageMeta";

interface PlaceholderPageProps {
  route: string;
  title: string;
  phase: string;
  description?: string;
  children?: ReactNode;
}

/**
 * Shared placeholder for routes that will be filled in during Phases 2-7.
 * Renders a terminal-style "stub" panel so the skeleton is visually
 * consistent and mobile-responsive from day 1.
 */
export function PlaceholderPage({ route, title, phase, description, children }: PlaceholderPageProps) {
  return (
    <>
      <PageMeta title={`${title} · null_collective`} description={description} />
      <section className="container py-8 sm:py-12 lg:py-16">
        <div className="max-w-2xl">
          <p className="font-mono-accent text-xs text-muted-foreground mb-2">
            $ route {route}
          </p>
          <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl text-glow text-primary mb-3">
            {title}
          </h1>
          {description && (
            <p className="text-sm sm:text-base text-muted-foreground mb-6 max-w-prose">
              {description}
            </p>
          )}
          <div className="border border-dashed border-border/80 rounded-md p-4 sm:p-6 bg-card/40">
            <pre className="ascii-empty">
{`┌──────────────────────────────────────────┐
│  STUB · scheduled for ${phase.padEnd(20)}│
│  this surface is wired but not yet built │
└──────────────────────────────────────────┘`}
            </pre>
            {children && <div className="mt-4">{children}</div>}
          </div>
        </div>
      </section>
    </>
  );
}
