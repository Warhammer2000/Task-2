import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Upload, X } from "lucide-react";

type Visibility = "public" | "unlisted";
type State = "draft" | "published";

interface FormValues {
  host_id: string;
  title: string;
  description: string;
  start_at: string; // local datetime string for input
  end_at: string;
  timezone: string;
  capacity: number;
  visibility: Visibility;
  state: State;
  venue_address: string;
  venue_online_link: string;
  cover_image_url: string;
}

interface Props {
  mode: "create" | "edit";
  initial?: Partial<FormValues> & { id?: string };
}

const schema = z.object({
  host_id: z.string().uuid("pick a host"),
  title: z.string().trim().min(3, "min 3 chars").max(140),
  description: z.string().trim().max(5000).optional().or(z.literal("")),
  start_at: z.string().min(1, "required"),
  end_at: z.string().min(1, "required"),
  timezone: z.string().trim().min(1).max(64).default("UTC"),
  capacity: z.coerce.number().int().min(0).max(100000),
  visibility: z.enum(["public", "unlisted"]),
  state: z.enum(["draft", "published"]),
  venue_address: z.string().trim().max(255).optional().or(z.literal("")),
  venue_online_link: z.string().trim().url("must be a URL").max(500).optional().or(z.literal("")),
  cover_image_url: z.string().trim().url().max(1000).optional().or(z.literal("")),
}).refine((d) => new Date(d.end_at).getTime() > new Date(d.start_at).getTime(), {
  message: "end must be after start", path: ["end_at"],
});

const toLocalInput = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function EventForm({ mode, initial }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [hosts, setHosts] = useState<Array<{ id: string; name: string }> | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  const [v, setV] = useState<FormValues>({
    host_id: initial?.host_id ?? "",
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    start_at: toLocalInput(initial?.start_at) || "",
    end_at: toLocalInput(initial?.end_at) || "",
    timezone: initial?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
    capacity: initial?.capacity ?? 0,
    visibility: (initial?.visibility as Visibility) ?? "public",
    state: (initial?.state as State) ?? "draft",
    venue_address: initial?.venue_address ?? "",
    venue_online_link: initial?.venue_online_link ?? "",
    cover_image_url: initial?.cover_image_url ?? "",
  });

  // Load hosts where user has role='host'
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("host_members")
        .select("hosts!inner ( id, name )")
        .eq("user_id", user.id)
        .eq("role", "host");
      const list = (data ?? []).map((r) => (r as { hosts: { id: string; name: string } }).hosts);
      setHosts(list);
      if (!v.host_id && list[0]) setV((s) => ({ ...s, host_id: list[0].id }));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleCoverUpload = async (file: File) => {
    if (!user) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("max 5MB");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("must be an image");
      return;
    }
    setUploadingCover(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("event-covers").upload(path, file, {
        cacheControl: "3600", upsert: false, contentType: file.type,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      const { data: pub } = supabase.storage.from("event-covers").getPublicUrl(path);
      setV((s) => ({ ...s, cover_image_url: pub.publicUrl }));
    } finally {
      setUploadingCover(false);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const startIso = v.start_at ? new Date(v.start_at).toISOString() : "";
    const endIso = v.end_at ? new Date(v.end_at).toISOString() : "";
    const parsed = schema.safeParse({ ...v, start_at: startIso, end_at: endIso });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      const payload = {
        host_id: parsed.data.host_id,
        title: parsed.data.title,
        description: parsed.data.description || null,
        start_at: parsed.data.start_at,
        end_at: parsed.data.end_at,
        timezone: parsed.data.timezone,
        capacity: parsed.data.capacity,
        visibility: parsed.data.visibility,
        state: parsed.data.state,
        venue_address: parsed.data.venue_address || null,
        venue_online_link: parsed.data.venue_online_link || null,
        cover_image_url: parsed.data.cover_image_url || null,
        is_paid: false,
      };

      if (mode === "create") {
        const { data, error } = await supabase.from("events").insert(payload).select("id").single();
        if (error || !data) { toast.error(error?.message ?? "create failed"); return; }
        toast.success("event created");
        navigate("/dashboard");
      } else if (initial?.id) {
        const { error } = await supabase.from("events").update(payload).eq("id", initial.id);
        if (error) { toast.error(error.message); return; }
        toast.success("event updated");
        navigate("/dashboard");
      }
    } finally {
      setBusy(false);
    }
  };

  if (!hosts) return <Skeleton className="h-96 w-full rounded-md" />;
  if (hosts.length === 0) {
    return (
      <div className="border border-dashed border-border/80 rounded-md p-6 bg-card/40">
        <pre className="ascii-empty">{`> no host profile — create one first`}</pre>
        <Button asChild variant="outline" className="mt-4 font-mono-accent">
          <a href="/onboarding/host">→ create host profile</a>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* Host selector (only if multiple) */}
      {hosts.length > 1 && (
        <div className="space-y-1.5">
          <Label className="font-mono-accent text-xs">host</Label>
          <select
            value={v.host_id}
            onChange={(e) => setV((s) => ({ ...s, host_id: e.target.value }))}
            className="w-full h-10 rounded-md border border-input bg-background px-3 font-mono-accent text-sm"
          >
            {hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="title" className="font-mono-accent text-xs">title</Label>
        <Input id="title" value={v.title} onChange={(e) => setV((s) => ({ ...s, title: e.target.value }))}
          placeholder="Lockpick Village 2026" maxLength={140} required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="desc" className="font-mono-accent text-xs">description</Label>
        <Textarea id="desc" value={v.description} onChange={(e) => setV((s) => ({ ...s, description: e.target.value }))}
          rows={5} maxLength={5000} placeholder="what is it · who is it for · what to bring" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="start_at" className="font-mono-accent text-xs">start</Label>
          <Input id="start_at" type="datetime-local" value={v.start_at}
            onChange={(e) => setV((s) => ({ ...s, start_at: e.target.value }))} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="end_at" className="font-mono-accent text-xs">end</Label>
          <Input id="end_at" type="datetime-local" value={v.end_at}
            onChange={(e) => setV((s) => ({ ...s, end_at: e.target.value }))} required />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="tz" className="font-mono-accent text-xs">timezone</Label>
          <Input id="tz" value={v.timezone} onChange={(e) => setV((s) => ({ ...s, timezone: e.target.value }))}
            placeholder="Europe/Berlin" maxLength={64} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cap" className="font-mono-accent text-xs">capacity (0 = sold out / unlimited if always-confirm)</Label>
          <Input id="cap" type="number" min={0} max={100000} value={v.capacity}
            onChange={(e) => setV((s) => ({ ...s, capacity: parseInt(e.target.value || "0", 10) }))} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="addr" className="font-mono-accent text-xs">venue address</Label>
          <Input id="addr" value={v.venue_address} onChange={(e) => setV((s) => ({ ...s, venue_address: e.target.value }))}
            placeholder="Tashkent, …" maxLength={255} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="online" className="font-mono-accent text-xs">online link</Label>
          <Input id="online" type="url" value={v.venue_online_link}
            onChange={(e) => setV((s) => ({ ...s, venue_online_link: e.target.value }))}
            placeholder="https://…" maxLength={500} />
        </div>
      </div>

      {/* Cover image */}
      <div className="space-y-1.5">
        <Label className="font-mono-accent text-xs">cover image</Label>
        {v.cover_image_url ? (
          <div className="relative aspect-[16/9] rounded-md border border-border/70 overflow-hidden">
            <img src={v.cover_image_url} alt="" className="h-full w-full object-cover" />
            <Button type="button" size="sm" variant="outline" onClick={() => setV((s) => ({ ...s, cover_image_url: "" }))}
              className="absolute top-2 right-2 font-mono-accent">
              <X className="h-3.5 w-3.5 mr-1" /> remove
            </Button>
          </div>
        ) : (
          <label className="flex items-center justify-center gap-2 border border-dashed border-border/80 rounded-md py-6 cursor-pointer hover:border-primary/60 transition-colors">
            <Upload className="h-4 w-4" />
            <span className="font-mono-accent text-sm text-muted-foreground">
              {uploadingCover ? "uploading…" : "click to upload (max 5MB)"}
            </span>
            <input
              type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCoverUpload(f); }}
              disabled={uploadingCover}
            />
          </label>
        )}
      </div>

      {/* Visibility / State / Free-Paid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
        <div className="border border-border/60 rounded-md p-3">
          <Label className="font-mono-accent text-xs text-muted-foreground">visibility</Label>
          <div className="mt-2 flex items-center gap-2">
            <Switch
              id="vis"
              checked={v.visibility === "public"}
              onCheckedChange={(c) => setV((s) => ({ ...s, visibility: c ? "public" : "unlisted" }))}
            />
            <span className="font-mono-accent text-sm">{v.visibility === "public" ? "public" : "unlisted"}</span>
          </div>
        </div>

        <div className="border border-border/60 rounded-md p-3">
          <Label className="font-mono-accent text-xs text-muted-foreground">state</Label>
          <div className="mt-2 flex items-center gap-2">
            <Switch
              id="st"
              checked={v.state === "published"}
              onCheckedChange={(c) => setV((s) => ({ ...s, state: c ? "published" : "draft" }))}
            />
            <span className="font-mono-accent text-sm">{v.state}</span>
          </div>
        </div>

        <div className="border border-border/60 rounded-md p-3">
          <Label className="font-mono-accent text-xs text-muted-foreground">price</Label>
          <div className="mt-2 inline-flex rounded-md border border-border/70 overflow-hidden">
            <button type="button" className="px-3 py-1.5 font-mono-accent text-xs bg-primary/20 text-primary border-r border-border/70" disabled>
              free
            </button>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0}>
                  <button type="button" disabled
                    className="px-3 py-1.5 font-mono-accent text-xs text-muted-foreground/60 cursor-not-allowed">
                    paid
                  </button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Coming soon — Free events only for now</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 pt-3">
        <Button type="submit" disabled={busy} className="font-mono-accent shadow-glow">
          {busy ? "saving…" : mode === "create" ? "create event →" : "save changes →"}
        </Button>
        <Button type="button" variant="outline" onClick={() => navigate("/dashboard")} className="font-mono-accent">
          cancel
        </Button>
      </div>
    </form>
  );
}
