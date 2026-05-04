import { Link, NavLink } from "react-router-dom";
import { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { VMaskAvatar } from "@/components/VMaskAvatar";
import { Button } from "@/components/ui/button";
import { NotificationBanner } from "@/components/NotificationBanner";

export function SiteShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();

  const navCls = ({ isActive }: { isActive: boolean }) =>
    `font-mono-accent text-xs sm:text-sm transition-colors ${
      isActive ? "text-primary text-glow" : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/60 backdrop-blur supports-[backdrop-filter]:bg-background/70 sticky top-0 z-40">
        <div className="container flex items-center justify-between gap-4 py-3 sm:py-4">
          <Link to="/" className="flex items-center gap-2 group">
            <span className="font-mono-accent text-primary text-glow text-base sm:text-lg">
              ▮ null_collective
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-5">
            <NavLink to="/" end className={navCls}>./explore</NavLink>
            {user && <NavLink to="/my/tickets" className={navCls}>./tickets</NavLink>}
            {user && <NavLink to="/my/events" className={navCls}>./my-events</NavLink>}
            {user && <NavLink to="/dashboard" className={navCls}>./host</NavLink>}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            {user ? (
              <>
                <VMaskAvatar seed={user.id} size={32} />
                <Button variant="ghost" size="sm" onClick={signOut} className="font-mono-accent text-xs">
                  sign out
                </Button>
              </>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm" className="font-mono-accent text-xs">
                  <Link to="/auth/sign-in">sign in</Link>
                </Button>
                <Button asChild size="sm" className="font-mono-accent text-xs shadow-glow">
                  <Link to="/auth/sign-up">join</Link>
                </Button>
              </>
            )}
          </div>
        </div>

        {/* mobile nav row */}
        <nav className="md:hidden border-t border-border/40 flex items-center justify-around py-2">
          <NavLink to="/" end className={navCls}>explore</NavLink>
          {user && <NavLink to="/my/tickets" className={navCls}>tickets</NavLink>}
          {user && <NavLink to="/my/events" className={navCls}>events</NavLink>}
          {user && <NavLink to="/dashboard" className={navCls}>host</NavLink>}
        </nav>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border/60 mt-12">
        <div className="container py-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs font-mono-accent text-muted-foreground">
          <span>$ null_collective --version 0.3.0</span>
          <span>events for the underground · stay clean, stay curious</span>
        </div>
      </footer>

      <NotificationBanner />
    </div>
  );
}
