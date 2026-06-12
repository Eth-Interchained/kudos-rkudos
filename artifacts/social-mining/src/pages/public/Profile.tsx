import { useEffect } from "react";
import { useLocation } from "wouter";
import { useMinerIdentity } from "@/hooks/useMinerIdentity";
import { OnboardingModal } from "@/components/OnboardingModal";

/**
 * /profile → redirects to /participants/:handle if onboarded,
 * otherwise triggers the onboarding modal.
 */
export default function Profile() {
  const [, navigate] = useLocation();
  const { identity, loading, setXHandle, setWalletAddress, setEmail, completeOnboarding } = useMinerIdentity();

  useEffect(() => {
    if (!loading && identity?.xHandle) {
      navigate(`/participants/${identity.xHandle}`, { replace: true });
    }
  }, [loading, identity, navigate]);

  if (loading) {
    return (
      <div className="max-w-xl mx-auto p-8">
        <div className="h-48 border-4 border-foreground bg-muted animate-pulse brutal-shadow" />
      </div>
    );
  }

  // Not onboarded — show onboarding modal
  if (identity && !identity.xHandle) {
    return (
      <div className="max-w-xl mx-auto space-y-8 animate-in fade-in p-8">
        <OnboardingModal
          open={true}
          identity={identity}
          onSetHandle={setXHandle}
          onSetWallet={setWalletAddress}
          onSetEmail={setEmail}
          onComplete={() => {
            completeOnboarding();
            if (identity.xHandle) {
              navigate(`/participants/${identity.xHandle}`, { replace: true });
            }
          }}
        />
        <div className="border-4 border-foreground bg-card brutal-shadow p-12 text-center space-y-4">
          <div className="text-5xl">⛏️</div>
          <h1 className="text-2xl font-black uppercase">Set Up Your Miner</h1>
          <p className="font-mono text-sm text-muted-foreground">
            Complete the onboarding to start mining $ITC.
          </p>
        </div>
      </div>
    );
  }

  return null;
}
