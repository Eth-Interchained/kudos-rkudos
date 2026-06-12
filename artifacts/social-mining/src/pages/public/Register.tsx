import { useState } from "react";
import { useWalletBind } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "wouter";

export default function Register() {
  const [handle, setHandle] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const { toast } = useToast();
  const bind = useWalletBind();

  const submit = () => {
    if (!handle || !address) return;
    bind.mutate(
      { data: { handle, itcAddress: address, email: email.trim() || undefined } },
      {
        onSuccess: () => {
          setDone(true);
          toast({
            title: "Registered",
            description: email.trim()
              ? "Payout address saved & subscribed. You're ready to mine."
              : "Payout address saved. You're ready to mine.",
          });
        },
        onError: (err: unknown) => {
          const description =
            (err as { response?: { data?: { error?: string } } })?.response?.data
              ?.error ?? "Failed to save address";
          toast({ title: "Error", description, variant: "destructive" });
        },
      },
    );
  };

  return (
    <div className="max-w-md mx-auto space-y-8 py-12 animate-in fade-in">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-black uppercase">Register</h1>
        <p className="text-muted-foreground font-mono">
          Register your X handle and save an ITC payout address so settlements can trace and pay your
          replies.
        </p>
      </div>

      <div className="border-4 border-foreground bg-card p-6 brutal-shadow space-y-6">
        {!done && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="font-bold uppercase">X Handle</Label>
              <Input
                value={handle}
                onChange={(e) => setHandle(e.target.value.replace(/^@+/, "").replace(/\s+/g, ""))}
                placeholder="Without @ (e.g. vitalikbuterin)"
                className="border-2 border-foreground rounded-none shadow-none font-mono"
                data-testid="input-register-handle"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-bold uppercase">ITC Address</Label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value.trim())}
                placeholder="itc1… or base58"
                className="border-2 border-foreground rounded-none shadow-none font-mono"
                data-testid="input-register-address"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-bold uppercase">
                Email <span className="text-muted-foreground normal-case font-mono text-xs">(optional)</span>
              </Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value.trim())}
                placeholder="you@example.com — weekly digest"
                className="border-2 border-foreground rounded-none shadow-none font-mono"
                data-testid="input-register-email"
              />
              <p className="text-xs font-mono text-muted-foreground">
                Get the weekly snapshot of mined posts. Unsubscribe anytime.
              </p>
            </div>
            <Button
              onClick={submit}
              disabled={bind.isPending || !handle || !address}
              className="w-full border-2 border-foreground rounded-none brutal-shadow hover:-translate-y-1 transition-all"
              data-testid="button-register-bind"
            >
              {bind.isPending ? "Saving…" : "Register & Save Address"}
            </Button>
          </div>
        )}

        {done && (
          <div className="text-center space-y-4 animate-in fade-in">
            <div className="text-3xl font-black uppercase">All set ✓</div>
            <p className="text-muted-foreground font-mono">
              You're registered. Reply to mining blocks to start earning ITC.
            </p>
            <Link
              href="/blocks"
              className="inline-block bg-foreground text-background px-4 py-2 font-bold uppercase brutal-shadow"
            >
              View Mining Blocks
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
