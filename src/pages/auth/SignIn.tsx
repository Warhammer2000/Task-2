import { FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { PageMeta } from "@/components/PageMeta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const schema = z.object({
  email: z.string().trim().email("invalid email").max(255),
  password: z.string().min(8, "min 8 chars").max(72),
});

const SignIn = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirect = params.get("redirect") || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate(redirect, { replace: true });
  };

  return (
    <>
      <PageMeta title="Sign in · null_collective" />
      <section className="container py-10 sm:py-16">
        <div className="max-w-md mx-auto border border-border/80 rounded-md p-5 sm:p-7 bg-card/60 shadow-soft">
          <p className="font-mono-accent text-xs text-muted-foreground mb-2">$ auth/sign-in</p>
          <h1 className="font-display text-2xl sm:text-3xl text-primary text-glow mb-5">welcome back</h1>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="font-mono-accent text-xs">email</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="font-mono-accent text-xs">password</Label>
              <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} maxLength={72} />
            </div>
            <Button type="submit" disabled={busy} className="w-full font-mono-accent shadow-glow">
              {busy ? "..." : "sign in"}
            </Button>
          </form>
          <p className="mt-5 text-sm text-muted-foreground">
            no account?{" "}
            <Link to={`/auth/sign-up${redirect !== "/" ? `?redirect=${encodeURIComponent(redirect)}` : ""}`} className="text-primary hover:underline">
              join the collective
            </Link>
          </p>
        </div>
      </section>
    </>
  );
};

export default SignIn;
