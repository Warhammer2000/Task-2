import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Flag } from "lucide-react";
import { toast } from "sonner";

type Target = "event" | "photo";

interface Props {
  targetType: Target;
  targetId: string;
  size?: "sm" | "default";
  variant?: "ghost" | "outline";
  label?: string;
  className?: string;
}

/** Reusable report trigger + modal. Anyone (incl. anon) can submit per RLS. */
export function ReportButton({ targetType, targetId, size = "sm", variant = "ghost", label, className }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const r = reason.trim();
    if (r.length < 5) {
      toast.error("please describe the issue (min 5 chars)");
      return;
    }
    if (r.length > 1000) {
      toast.error("max 1000 chars");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.from("reports").insert({
        target_type: targetType,
        target_id: targetId,
        reporter_id: user?.id ?? null,
        reason: r,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("report submitted — thank you");
      setOpen(false);
      setReason("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant}
        onClick={() => setOpen(true)}
        className={`font-mono-accent ${className ?? ""}`}
      >
        <Flag className="h-3.5 w-3.5 mr-1" /> {label ?? "report"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-primary">report this {targetType}</DialogTitle>
            <DialogDescription>
              describe the issue. moderators of this event will review.
              {!user && " you may submit anonymously."}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={5}
            maxLength={1000}
            placeholder="what's wrong? (spam, unsafe, off-topic, etc.)"
            className="font-mono-accent text-sm"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy} className="font-mono-accent">
              cancel
            </Button>
            <Button onClick={submit} disabled={busy} className="font-mono-accent shadow-glow">
              {busy ? "..." : "submit report →"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
