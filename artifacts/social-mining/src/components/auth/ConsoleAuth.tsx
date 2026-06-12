import { createContext, useContext, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getAdminToken,
  setAdminToken,
  clearAdminToken,
  validateAdminToken,
} from "@/lib/adminAuth";

interface ConsoleAuthValue {
  signOut: () => void;
}

const ConsoleAuthContext = createContext<ConsoleAuthValue | null>(null);

export function useConsoleAuth(): ConsoleAuthValue {
  const ctx = useContext(ConsoleAuthContext);
  if (!ctx) {
    throw new Error("useConsoleAuth must be used within ConsoleAuthProvider");
  }
  return ctx;
}

function ConsoleLogin({ onSuccess }: { onSuccess: () => void }) {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    setBusy(true);
    setError(null);
    const ok = await validateAdminToken(token.trim());
    setBusy(false);
    if (!ok) {
      setError("Invalid admin token.");
      return;
    }
    setAdminToken(token.trim());
    onSuccess();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-md border-4 border-foreground bg-card p-8 brutal-shadow"
      >
        <h1 className="mb-2 text-3xl font-black uppercase tracking-tighter">
          Operator Console
        </h1>
        <p className="mb-6 text-sm font-bold uppercase tracking-tight text-muted-foreground">
          Enter your admin token to continue
        </p>
        <Input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Admin token"
          autoFocus
          className="mb-4 border-4 border-foreground font-mono"
          data-testid="input-admin-token"
        />
        {error && (
          <p
            className="mb-4 border-4 border-destructive bg-destructive/10 p-2 text-sm font-bold uppercase text-destructive"
            data-testid="text-auth-error"
          >
            {error}
          </p>
        )}
        <Button
          type="submit"
          disabled={busy}
          className="w-full border-4 border-foreground text-lg font-black uppercase tracking-tight brutal-shadow"
          data-testid="button-admin-login"
        >
          {busy ? "Verifying…" : "Unlock Console"}
        </Button>
      </form>
    </div>
  );
}

export function ConsoleAuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [authed, setAuthed] = useState<boolean>(() => Boolean(getAdminToken()));

  if (!authed) {
    return <ConsoleLogin onSuccess={() => setAuthed(true)} />;
  }

  const signOut = () => {
    clearAdminToken();
    setAuthed(false);
  };

  return (
    <ConsoleAuthContext.Provider value={{ signOut }}>
      {children}
    </ConsoleAuthContext.Provider>
  );
}
