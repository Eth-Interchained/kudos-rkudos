import { useState } from "react";
import { useWalletBind } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Wallet() {
  const [handle, setHandle] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");

  const { toast } = useToast();
  const bind = useWalletBind();

  const handleBind = () => {
    if (!handle || !address) return;
    bind.mutate(
      { data: { handle, itcAddress: address, email: email.trim() || undefined } },
      {
        onSuccess: () => {
          toast({
            title: "Success",
            description: email.trim()
              ? "Payout address saved & subscribed to the weekly digest!"
              : "Payout address saved!",
          });
          setHandle("");
          setAddress("");
          setEmail("");
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
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-black uppercase">Bind Wallet</h1>
        <p className="text-muted-foreground font-mono">Save your ITC payout address to claim your rewards.</p>
      </div>

      <div className="border-4 border-foreground bg-card p-6 brutal-shadow space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="font-bold uppercase">X Handle</Label>
            <Input
              value={handle}
              onChange={(e) => setHandle(e.target.value.replace(/^@+/, "").replace(/\s+/g, ""))}
              placeholder="Without @ (e.g. vitalikbuterin)"
              className="border-2 border-foreground rounded-none shadow-none font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label className="font-bold uppercase">ITC Address</Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value.trim())}
              placeholder="itc1… or base58"
              className="border-2 border-foreground rounded-none shadow-none font-mono"
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
            />
            <p className="text-xs font-mono text-muted-foreground">
              Get the weekly snapshot of mined posts. Unsubscribe anytime.
            </p>
          </div>
          <Button
            onClick={handleBind}
            disabled={bind.isPending || !handle || !address}
            className="w-full border-2 border-foreground rounded-none brutal-shadow hover:-translate-y-1 hover:shadow-[4px_4px_0px_0px_hsl(var(--foreground))] transition-all"
          >
            {bind.isPending ? "Saving..." : "Save Payout Address"}
          </Button>
        </div>
      </div>
    </div>
  );
}
