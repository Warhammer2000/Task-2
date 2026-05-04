import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageMeta } from "@/components/PageMeta";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Copy, Trash2, Plus, Shield, ScanLine } from "lucide-react";

interface HostOption { id: string; name: string; slug: string; }
interface MemberRow {
  id: string; user_id: string; role: "host" | "checker";
  profiles?: { display_name: string | null } | null;
}
interface InviteRow {
  id: string; host_id: string; token: string; role: "host" | "checker";
  created_at: string; revoked_at: string | null;
}

const Members = () => {
  const { user } = useAuth();
  const [hosts, setHosts] = useState<HostOption[] | null>(null);
  const [activeHostId, setActiveHostId] = useState<string>("");
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      // Owner-only operations on invites; show owned hosts.
      const { data } = await supabase.from("hosts").select("id, name, slug").eq("owner_id", user.id);
      const list = (data ?? []) as HostOption[];
      setHosts(list);
      if (list[0]) setActiveHostId(list[0].id);
    })();
  }, [user]);

  const reload = async (hostId: string) => {
    if (!hostId) return;
    const [{ data: m }, { data: inv }] = await Promise.all([
      supabase.from("host_members").select("id, user_id, role, profiles:user_id ( display_name )").eq("host_id", hostId),
      supabase.from("host_invites").select("id, host_id, token, role, created_at, revoked_at").eq("host_id", hostId).order("created_at", { ascending: false }),
    ]);
    setMembers((m ?? []) as unknown as MemberRow[]);
    setInvites((inv ?? []) as InviteRow[]);
  };

  useEffect(() => { if (activeHostId) reload(activeHostId); }, [activeHostId]);

  const generateInvite = async (role: "host" | "checker") => {
    if (!activeHostId || !user) return;
    setBusy(true);
    try {
      const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
      const { error } = await supabase.from("host_invites").insert({
        host_id: activeHostId, token, role, created_by: user.id,
      });
      if (error) { toast.error(error.message); return; }
      toast.success("invite created");
      await reload(activeHostId);
    } finally { setBusy(false); }
  };

  const copyInviteLink = async (token: string) => {
    const url = `${window.location.origin}/invite/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("link copied");
    } catch {
      toast.message(url);
    }
  };

  const revokeInvite = async (id: string) => {
    setBusy(true);
    try {
      const { error } = await supabase.from("host_invites").update({ revoked_at: new Date().toISOString() }).eq("id", id);
      if (error) { toast.error(error.message); return; }
      toast.success("invite revoked");
      await reload(activeHostId);
    } finally { setBusy(false); }
  };

  const removeMember = async (id: string, isSelf: boolean) => {
    if (isSelf) { toast.error("cannot remove yourself here"); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from("host_members").delete().eq("id", id);
      if (error) { toast.error(error.message); return; }
      toast.success("member removed");
      await reload(activeHostId);
    } finally { setBusy(false); }
  };

  return (
    <>
      <PageMeta title="members & invites · null_collective" />
      <section className="container py-6 sm:py-10 max-w-4xl">
        <header className="mb-6">
          <p className="font-mono-accent text-xs text-muted-foreground mb-2">$ ./dashboard/members</p>
          <h1 className="font-display text-2xl sm:text-3xl text-primary text-glow">members & invites</h1>
          <p className="mt-1 text-sm text-muted-foreground">owner-only · invites are persistent until revoked</p>
        </header>

        {hosts === null ? (
          <Skeleton className="h-40 w-full rounded-md" />
        ) : hosts.length === 0 ? (
          <div className="border border-dashed border-border/80 rounded-md p-6 bg-card/40">
            <pre className="ascii-empty">{`> you don't own any host yet — create one first.`}</pre>
            <Button asChild variant="outline" className="mt-4 font-mono-accent">
              <Link to="/onboarding/host">→ create host</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {hosts.length > 1 && (
              <div className="space-y-1.5">
                <label className="font-mono-accent text-xs text-muted-foreground">host</label>
                <select value={activeHostId} onChange={(e) => setActiveHostId(e.target.value)}
                  className="w-full sm:w-auto h-10 rounded-md border border-input bg-background px-3 font-mono-accent text-sm">
                  {hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              </div>
            )}

            {/* Generate invites */}
            <div className="border border-border/70 rounded-md p-4 bg-card/60">
              <p className="font-mono-accent text-xs text-muted-foreground mb-3">$ generate invite link</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button onClick={() => generateInvite("host")} disabled={busy} className="font-mono-accent">
                  <Plus className="h-3.5 w-3.5 mr-1" /> <Shield className="h-3.5 w-3.5 mr-1" /> host invite
                </Button>
                <Button onClick={() => generateInvite("checker")} disabled={busy} variant="outline" className="font-mono-accent">
                  <Plus className="h-3.5 w-3.5 mr-1" /> <ScanLine className="h-3.5 w-3.5 mr-1" /> checker invite
                </Button>
              </div>
              <p className="mt-2 font-mono-accent text-[11px] text-muted-foreground">
                hosts can manage events; checkers can scan tickets at the door.
              </p>
            </div>

            {/* Active invites */}
            <div>
              <h2 className="font-mono-accent text-sm mb-2">// active invites</h2>
              <div className="space-y-2">
                {invites.length === 0 && (
                  <p className="font-mono-accent text-sm text-muted-foreground">// none</p>
                )}
                {invites.map((iv) => {
                  const url = `${window.location.origin}/invite/${iv.token}`;
                  const revoked = !!iv.revoked_at;
                  return (
                    <div key={iv.id} className="border border-border/60 rounded-md bg-card/40 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`font-mono-accent text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm border ${
                            iv.role === "host" ? "border-primary/40 bg-primary/10 text-primary" : "border-secondary/40 bg-secondary/10 text-secondary"
                          }`}>{iv.role}</span>
                          {revoked && <span className="font-mono-accent text-[10px] uppercase text-destructive">revoked</span>}
                        </div>
                        <code className="block mt-1 font-mono-accent text-[11px] sm:text-xs text-muted-foreground truncate">{url}</code>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button size="sm" variant="outline" onClick={() => copyInviteLink(iv.token)} disabled={revoked} className="font-mono-accent">
                          <Copy className="h-3.5 w-3.5 mr-1" /> copy
                        </Button>
                        {!revoked && (
                          <Button size="sm" variant="ghost" onClick={() => revokeInvite(iv.id)} disabled={busy} className="font-mono-accent text-destructive">
                            <Trash2 className="h-3.5 w-3.5 mr-1" /> revoke
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Members list */}
            <div>
              <h2 className="font-mono-accent text-sm mb-2">// current members</h2>
              <div className="space-y-2">
                {members.length === 0 && (
                  <p className="font-mono-accent text-sm text-muted-foreground">// none yet</p>
                )}
                {members.map((m) => {
                  const isSelf = m.user_id === user?.id;
                  return (
                    <div key={m.id} className="border border-border/60 rounded-md bg-card/40 p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-mono-accent text-sm">
                          {m.profiles?.display_name ?? m.user_id.slice(0, 8)}
                        </span>
                        <span className="ml-2 font-mono-accent text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm border border-border/70 bg-muted/40 text-muted-foreground">
                          {m.role}
                        </span>
                        {isSelf && <span className="ml-2 font-mono-accent text-[10px] text-primary">(you)</span>}
                      </div>
                      {!isSelf && (
                        <Button size="sm" variant="ghost" onClick={() => removeMember(m.id, isSelf)} disabled={busy} className="font-mono-accent text-destructive">
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> remove
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </section>
    </>
  );
};

export default Members;
