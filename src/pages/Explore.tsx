import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { PageMeta } from "@/components/PageMeta";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { EventCard } from "@/components/events/EventCard";
import { fetchExploreEvents } from "@/lib/events";

const Explore = () => {
  // URL-backed filters → stable, shareable links (Task 1 lesson)
  const [params, setParams] = useSearchParams();
  const search = params.get("q") ?? "";
  const location = params.get("loc") ?? "";
  const includePast = params.get("past") === "1";

  // local input mirrors so typing doesn't push history per keystroke
  const [searchInput, setSearchInput] = useState(search);
  const [locInput, setLocInput] = useState(location);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const filters = useMemo(
    () => ({ search, location, includePast }),
    [search, location, includePast]
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ["explore", filters],
    queryFn: () => fetchExploreEvents(filters),
  });

  const events = data ?? [];

  return (
    <>
      <PageMeta
        title="null_collective · explore underground events"
        description="Discover upcoming hacker meetups, demoscene showcases, lockpick villages, and zine release parties. Search, filter, RSVP."
      />
      <section className="container py-6 sm:py-10 lg:py-14">
        <header className="mb-6 sm:mb-8 max-w-2xl">
          <p className="font-mono-accent text-xs text-muted-foreground mb-2">$ ./explore --upcoming</p>
          <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl text-glow text-primary">
            events for the underground
          </h1>
          <p className="mt-2 text-sm sm:text-base text-muted-foreground">
            community-run gatherings · public listings only · unlisted events accessible by direct link
          </p>
        </header>

        {/* Filter bar — mobile-first stacked, columns from sm: up */}
        <form
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] gap-3 sm:gap-4 mb-6 sm:mb-8"
          onSubmit={(e) => {
            e.preventDefault();
            setParam("q", searchInput.trim());
            setParam("loc", locInput.trim());
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="q" className="font-mono-accent text-xs text-muted-foreground">search</Label>
            <Input
              id="q"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onBlur={() => setParam("q", searchInput.trim())}
              placeholder="title, description…"
              className="font-mono-accent"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="loc" className="font-mono-accent text-xs text-muted-foreground">location</Label>
            <Input
              id="loc"
              value={locInput}
              onChange={(e) => setLocInput(e.target.value)}
              onBlur={() => setParam("loc", locInput.trim())}
              placeholder="city, venue…"
              className="font-mono-accent"
            />
          </div>
          <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2">
              <Switch
                id="past"
                checked={includePast}
                onCheckedChange={(v) => setParam("past", v ? "1" : "")}
              />
              <Label htmlFor="past" className="font-mono-accent text-xs">include past</Label>
            </div>
          </div>
        </form>

        {/* Results */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-64 rounded-md" />
            ))}
          </div>
        ) : error ? (
          <div className="border border-destructive/50 rounded-md p-4 font-mono-accent text-sm text-destructive">
            $ error: {(error as Error).message}
          </div>
        ) : events.length === 0 ? (
          <EmptyState includePast={includePast} hasFilters={!!(search || location)} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {events.map((ev) => (
              <EventCard key={ev.id} event={ev} />
            ))}
          </div>
        )}
      </section>
    </>
  );
};

function EmptyState({ includePast, hasFilters }: { includePast: boolean; hasFilters: boolean }) {
  return (
    <div className="border border-dashed border-border/80 rounded-md p-6 sm:p-10 bg-card/40 max-w-2xl">
      <pre className="ascii-empty">
{`┌──────────────────────────────────────────────┐
│   ░▒▓ no signal ▓▒░                          │
│                                              │
│   no events match the current filters.       │
│   ${(hasFilters ? "try clearing search/location." : includePast ? "the archive is quiet for now."   : "the schedule is empty — check back soon.").padEnd(42)}│
│                                              │
│   $ tip: hosts can publish via ./host        │
└──────────────────────────────────────────────┘`}
      </pre>
    </div>
  );
}

export default Explore;
