export function EndedPill({ className = "" }: { className?: string }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-sm border border-muted-foreground/40 bg-muted/40 px-2 py-0.5 font-mono-accent text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground " +
        className
      }
      aria-label="Event ended"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/70" />
      ended
    </span>
  );
}

export function LivePill({ className = "" }: { className?: string }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-sm border border-primary/50 bg-primary/10 px-2 py-0.5 font-mono-accent text-[10px] sm:text-xs uppercase tracking-wider text-primary " +
        className
      }
      aria-label="Event upcoming"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
      upcoming
    </span>
  );
}
