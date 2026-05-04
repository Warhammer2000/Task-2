import { PageMeta } from "@/components/PageMeta";
import { EventForm } from "@/components/events/EventForm";

const EventNew = () => (
  <>
    <PageMeta title="new event · null_collective" />
    <section className="container py-6 sm:py-10 max-w-3xl">
      <header className="mb-6">
        <p className="font-mono-accent text-xs text-muted-foreground mb-2">$ ./dashboard/events/new</p>
        <h1 className="font-display text-2xl sm:text-3xl text-primary text-glow">create event</h1>
      </header>
      <EventForm mode="create" />
    </section>
  </>
);
export default EventNew;
