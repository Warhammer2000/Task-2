import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageMeta } from "@/components/PageMeta";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

interface InviteData {
  id: string; host_id: string; role: "host" | "checker"; revoked_at: string | null;
  hosts: { name: string; slug: string } | null;
}

const InviteAccept = () => {
  const { token } = useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<InviteData | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      const { data } = await supabase
        .from("host_invites")
        .select("id, host_id, role, revoked_at, hosts:host_id ( name, slug )")
        .eq("token", token)
        .maybeSingle();
      setInvite((data as unknown as InviteData) ?? null);
    })();
  }, [token]);

  const accept = async () => {
    if (!user || !invite) return;
    setBusy(true);
    try {
      // Idempotent: if already a member, just navigate.
      const { data: existing } = await supabase
        .from("host_members")
        .select("id, role")
        .eq("host_id", invite.host_id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        toast.message("you're already a member");
        navigate("/dashboard");
        return;
      }

      const { error } = await supabase.from("host_members").insert({
        host_id: invite.host_id, user_id: user.id, role: invite.role, invited_by: null,
      });
      if (error) { toast.error(error.message); return; }
      toast.success(`joined as ${invite.role}`);
      navigate("/dashboard");
    } finally { setBusy(false); }
  };

  return (
    <>
      <PageMeta title="accept invitation · null_collective" />
      <section className="container py-10 sm:py-16">
        <div className="max-w-md mx-auto border border-border/80 rounded-md p-5 sm:p-7 bg-card/60 shadow-soft">
          <p className="font-mono-accent text-xs text-muted-foreground mb-2">$ ./invite</p>
          <h1 className="font-display text-2xl sm:text-3xl text-primary text-glow mb-4">accept invitation</h1>

          {invite === undefined || loading ? (
            <Skeleton className="h-24 w-full" />
          ) : invite === null ? (
            <p className="font-mono-accent text-sm text-destructive">// invalid invite token.</p>
          ) : invite.revoked_at ? (
            <p className="font-mono-accent text-sm text-destructive">// this invite has been revoked.</p>
          ) : !user ? (
            <div className="space-y-3">
              <p className="text-sm">
                you've been invited to join <span className="text-primary">./{invite.hosts?.slug}</span> as{" "}
                <span className="font-mono-accent text-primary">{invite.role}</span>.
              </p>
              <p className="text-sm text-muted-foreground">sign in or create an account to accept.</p>
              <div className="flex gap-2">
                <Button asChild className="font-mono-accent shadow-glow">
                  <Link to={`/auth/sign-in?redirect=${encodeURIComponent(`/invite/${token}`)}`}>sign in →</Link>
                </Button>
                <Button asChild variant="outline" className="font-mono-accent">
                  <Link to={`/auth/sign-up?redirect=${encodeURIComponent(`/invite/${token}`)}`}>sign up →</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm">
                join <span className="text-primary">./{invite.hosts?.slug}</span> as{" "}
                <span className="font-mono-accent text-primary">{invite.role}</span>?
              </p>
              <Button onClick={accept} disabled={busy} className="w-full font-mono-accent shadow-glow">
                {busy ? "joining…" : "accept →"}
              </Button>
            </div>
          )}
        </div>
      </section>
    </>
  );
};

export default InviteAccept;
