import { Link } from "react-router-dom";
import { PageMeta } from "@/components/PageMeta";
import { Button } from "@/components/ui/button";

const NotFound = () => (
  <>
    <PageMeta title="404 · null_collective" />
    <section className="container py-16 sm:py-24">
      <div className="max-w-xl">
        <p className="font-mono-accent text-xs text-muted-foreground mb-2">$ events --find</p>
        <h1 className="font-display text-3xl sm:text-5xl text-primary text-glow mb-4">404 / not in the wire</h1>
        <pre className="ascii-empty mb-6">
{`┌─────────────────────────────┐
│  no rows returned           │
│  resource: ${typeof window !== "undefined" ? window.location.pathname.padEnd(17, " ").slice(0, 17) : "                 "}│
└─────────────────────────────┘`}
        </pre>
        <Button asChild className="font-mono-accent shadow-glow">
          <Link to="/">./back-to-explore</Link>
        </Button>
      </div>
    </section>
  </>
);

export default NotFound;
