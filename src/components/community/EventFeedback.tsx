import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, MessageSquare } from "lucide-react";
import { toast } from "sonner";

interface Props {
  eventId: string;
  endAt: string;
}

interface Feedback {
  id: string;
  rating: number;
  comment: string | null;
  user_id: string;
  created_at: string;
  profiles?: { display_name: string | null; avatar_url: string | null } | null;
}

/** Post-event 1-5 star feedback. Eligibility: end_at < now AND user has confirmed RSVP. */
export function EventFeedback({ eventId, endAt }: Props) {
  const { user } = useAuth();
  const ended = new Date(endAt).getTime() < Date.now();

  const [feedbacks, setFeedbacks] = useState<Feedback[] | null>(null);
  const [eligible, setEligible] = useState(false);
  const [myExisting, setMyExisting] = useState(false);

  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const { data } = await supabase
      .from("feedbacks")
      .select("id, rating, comment, user_id, created_at, profiles:user_id ( display_name, avatar_url )")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });
    const list = (data ?? []).map((row: any) => ({
      ...row,
      profiles: Array.isArray(row.profiles) ? row.profiles[0] ?? null : row.profiles,
    })) as Feedback[];
    setFeedbacks(list);
    if (user) setMyExisting(list.some((f) => f.user_id === user.id));
  }, [eventId, user]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Eligibility check: ended + confirmed RSVP
  useEffect(() => {
    (async () => {
      if (!user || !ended) {
        setEligible(false);
        return;
      }
      const { data } = await supabase
        .from("rsvps")
        .select("id")
        .eq("event_id", eventId)
        .eq("user_id", user.id)
        .eq("status", "confirmed")
        .maybeSingle();
      setEligible(!!data);
    })();
  }, [user, ended, eventId]);

  const submit = async () => {
    if (!user) return;
    if (rating < 1 || rating > 5) {
      toast.error("pick 1-5 stars");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.from("feedbacks").insert({
        event_id: eventId,
        user_id: user.id,
        rating,
        comment: comment.trim() || null,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("thanks for the feedback");
      setRating(0);
      setComment("");
      reload();
    } finally {
      setBusy(false);
    }
  };

  if (!ended) return null;

  const avg =
    feedbacks && feedbacks.length > 0
      ? feedbacks.reduce((s, f) => s + f.rating, 0) / feedbacks.length
      : null;

  return (
    <section className="mt-10 sm:mt-14">
      <h2 className="font-display text-xl sm:text-2xl text-primary text-glow flex items-center gap-2 mb-4">
        <MessageSquare className="h-5 w-5" /> feedback
        {avg !== null && (
          <span className="font-mono-accent text-sm text-muted-foreground">
            · {avg.toFixed(1)}/5 ({feedbacks!.length})
          </span>
        )}
      </h2>

      {/* Submission form */}
      {eligible && !myExisting && (
        <div className="border border-primary/40 rounded-md bg-card/60 p-4 sm:p-5 mb-6 shadow-glow">
          <p className="font-mono-accent text-xs text-muted-foreground mb-2">$ rate this event</p>
          <div className="flex items-center gap-1 mb-3">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(0)}
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
                className="p-1 -m-1 transition-transform hover:scale-110"
              >
                <Star
                  className={`h-7 w-7 sm:h-8 sm:w-8 ${
                    n <= (hover || rating)
                      ? "fill-primary text-primary"
                      : "text-muted-foreground/40"
                  }`}
                />
              </button>
            ))}
          </div>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="optional · what worked, what didn't"
            className="font-mono-accent text-sm mb-3"
          />
          <Button onClick={submit} disabled={busy || rating === 0} className="font-mono-accent shadow-glow">
            {busy ? "..." : "submit feedback →"}
          </Button>
        </div>
      )}
      {eligible && myExisting && (
        <div className="font-mono-accent text-xs text-muted-foreground mb-4">
          ✓ you've left feedback for this event
        </div>
      )}

      {/* Feedback list */}
      {feedbacks === null ? (
        <Skeleton className="h-24 w-full rounded-md" />
      ) : feedbacks.length === 0 ? (
        <pre className="ascii-empty text-muted-foreground text-xs">{`> no feedback yet`}</pre>
      ) : (
        <ul className="space-y-3">
          {feedbacks.map((f) => (
            <li key={f.id} className="border border-border/60 rounded-md bg-card/40 p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="flex">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star
                      key={n}
                      className={`h-3.5 w-3.5 ${
                        n <= f.rating ? "fill-primary text-primary" : "text-muted-foreground/30"
                      }`}
                    />
                  ))}
                </div>
                <span className="font-mono-accent text-xs text-muted-foreground">
                  · {f.profiles?.display_name ?? "anon"}
                </span>
              </div>
              {f.comment && <p className="text-sm text-foreground/90 whitespace-pre-wrap">{f.comment}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
