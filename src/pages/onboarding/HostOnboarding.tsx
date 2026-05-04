import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageMeta } from "@/components/PageMeta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const slugRegex = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

const schema = z.object({
  name: z.string().trim().min(2, "min 2 chars").max(80),
  slug: z.string().trim().toLowerCase().regex(slugRegex, "lowercase, alphanumeric and dashes only (2–40)"),
  contact_email: z.string().trim().email("invalid email").max(255).optional().or(z.literal("")),
  bio: z.string().trim().max(1000).optional().or(z.literal("")),
  logo_url: z.string().trim().url("must be a URL").max(500).optional().or(z.literal("")),
});

const slugify = (s: string) =>
  s.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40)
    .replace(/^-+|-+$/g, "");

const HostOnboarding = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [email, setEmail] = useState(user?.email ?? "");
  const [bio, setBio] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [busy, setBusy] = useState(false);

  // Auto-derive slug from name unless user has typed in slug field.
  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const parsed = schema.safeParse({ name, slug, contact_email: email, bio, logo_url: logoUrl });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      // Pre-flight slug uniqueness check (RLS allows public select on hosts).
      const { data: existing } = await supabase
        .from("hosts").select("id").eq("slug", parsed.data.slug).maybeSingle();
      if (existing) {
        toast.error("slug already taken — pick another");
        return;
      }

      const { data: host, error: hostErr } = await supabase
        .from("hosts")
        .insert({
          owner_id: user.id,
          name: parsed.data.name,
          slug: parsed.data.slug,
          contact_email: parsed.data.contact_email || null,
          bio: parsed.data.bio || null,
          logo_url: parsed.data.logo_url || null,
        })
        .select("id, slug")
        .single();
      if (hostErr || !host) {
        toast.error(hostErr?.message ?? "failed to create host");
        return;
      }

      // Owner-as-host membership row (RLS allows owner to insert).
      const { error: memErr } = await supabase
        .from("host_members")
        .insert({ host_id: host.id, user_id: user.id, role: "host" });
      if (memErr) {
        // Roll back the host so we don't leave an orphan.
        await supabase.from("hosts").delete().eq("id", host.id);
        toast.error(memErr.message);
        return;
      }

      toast.success("host profile live");
      navigate("/dashboard", { replace: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageMeta title="become a host · null_collective" />
      <section className="container py-8 sm:py-14">
        <div className="max-w-xl mx-auto border border-border/80 rounded-md p-5 sm:p-7 bg-card/60 shadow-soft">
          <p className="font-mono-accent text-xs text-muted-foreground mb-2">$ ./onboarding/host</p>
          <h1 className="font-display text-2xl sm:text-3xl text-primary text-glow mb-2">become a host</h1>
          <p className="text-sm text-muted-foreground mb-6">
            self-serve registration. pick a public handle and you're live.
          </p>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="h-name" className="font-mono-accent text-xs">name</Label>
              <Input id="h-name" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Null Collective" maxLength={80} required />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="h-slug" className="font-mono-accent text-xs">slug</Label>
              <div className="flex items-stretch border border-input rounded-md bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring">
                <span className="px-3 flex items-center font-mono-accent text-xs text-muted-foreground border-r border-border/60">
                  /hosts/
                </span>
                <Input
                  id="h-slug"
                  value={slug}
                  onChange={(e) => { setSlug(slugify(e.target.value)); setSlugTouched(true); }}
                  className="border-0 focus-visible:ring-0 font-mono-accent"
                  placeholder="null-collective"
                  maxLength={40}
                  required
                />
              </div>
              <p className="font-mono-accent text-[11px] text-muted-foreground">
                lowercase letters, numbers, dashes. 2–40 chars.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="h-email" className="font-mono-accent text-xs">contact email (optional)</Label>
              <Input id="h-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="hello@example.org" maxLength={255} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="h-bio" className="font-mono-accent text-xs">bio (optional)</Label>
              <Textarea id="h-bio" value={bio} onChange={(e) => setBio(e.target.value)}
                placeholder="who you are, what you organize…" maxLength={1000} rows={4} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="h-logo" className="font-mono-accent text-xs">logo url (optional)</Label>
              <Input id="h-logo" type="url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://…" maxLength={500} />
            </div>

            <Button type="submit" disabled={busy} className="w-full font-mono-accent shadow-glow">
              {busy ? "creating…" : "create host →"}
            </Button>
          </form>
        </div>
      </section>
    </>
  );
};

export default HostOnboarding;
