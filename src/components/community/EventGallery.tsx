import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Upload, Clock3, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { ReportButton } from "./ReportButton";

interface Photo {
  id: string;
  url: string;
  status: "pending" | "approved" | "hidden";
  uploader_id: string;
  created_at: string;
}

interface Props {
  eventId: string;
}

/** Photo gallery on event detail page — uploader + public approved grid. */
export function EventGallery({ eventId }: Props) {
  const { user } = useAuth();
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [uploading, setUploading] = useState(false);

  const reload = useCallback(async () => {
    // RLS returns approved + own + host-member photos
    const { data } = await supabase
      .from("gallery_photos")
      .select("id, url, status, uploader_id, created_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });
    setPhotos((data as Photo[]) ?? []);
  }, [eventId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleUpload = async (file: File) => {
    if (!user) {
      toast.error("sign in to upload");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("max 8MB");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("must be an image");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${user.id}/${eventId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("gallery-photos")
        .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
      if (upErr) {
        toast.error(upErr.message);
        return;
      }
      const { data: pub } = supabase.storage.from("gallery-photos").getPublicUrl(path);
      const { error: insErr } = await supabase.from("gallery_photos").insert({
        event_id: eventId,
        uploader_id: user.id,
        url: pub.publicUrl,
        status: "pending",
      });
      if (insErr) {
        toast.error(insErr.message);
        return;
      }
      toast.success("uploaded — pending review");
      reload();
    } finally {
      setUploading(false);
    }
  };

  const approved = (photos ?? []).filter((p) => p.status === "approved");
  const myPending = (photos ?? []).filter((p) => p.status === "pending" && p.uploader_id === user?.id);

  return (
    <section className="mt-10 sm:mt-14">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="font-display text-xl sm:text-2xl text-primary text-glow flex items-center gap-2">
          <ImageIcon className="h-5 w-5" /> gallery
        </h2>
        {user && (
          <label className="inline-flex items-center gap-2 border border-dashed border-border/80 hover:border-primary/60 transition-colors rounded-md px-3 py-2 cursor-pointer font-mono-accent text-xs sm:text-sm">
            <Upload className="h-4 w-4" />
            {uploading ? "uploading…" : "upload photo"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
                e.target.value = "";
              }}
              disabled={uploading}
            />
          </label>
        )}
      </div>

      {photos === null ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-md" />
          ))}
        </div>
      ) : approved.length === 0 && myPending.length === 0 ? (
        <div className="border border-dashed border-border/80 rounded-md p-6 bg-card/40">
          <pre className="ascii-empty text-muted-foreground text-xs sm:text-sm">
{`> no photos yet
> ${user ? "upload the first one ↑" : "sign in to contribute"}`}
          </pre>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {myPending.map((p) => (
            <figure key={p.id} className="relative aspect-square rounded-md overflow-hidden border border-secondary/40 bg-card/40 group">
              <img src={p.url} alt="" className="h-full w-full object-cover opacity-70" />
              <figcaption className="absolute inset-x-0 bottom-0 bg-secondary/20 backdrop-blur-sm border-t border-secondary/40 px-2 py-1 flex items-center gap-1 font-mono-accent text-[10px] sm:text-xs text-secondary">
                <Clock3 className="h-3 w-3" /> pending review
              </figcaption>
            </figure>
          ))}
          {approved.map((p) => (
            <figure key={p.id} className="relative aspect-square rounded-md overflow-hidden border border-border/70 bg-card/40 group">
              <img src={p.url} alt="" loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
              <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <ReportButton
                  targetType="photo"
                  targetId={p.id}
                  variant="outline"
                  className="bg-background/80 backdrop-blur"
                  label=""
                />
              </div>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}
