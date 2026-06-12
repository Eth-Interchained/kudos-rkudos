import {
  useListProjectsAdmin,
  useReviewProject,
  getListProjectsAdminQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

const STATUS_ORDER: Record<string, number> = { pending: 0, approved: 1, rejected: 2 };

export default function ProjectApplications() {
  const { data: projects, isLoading } = useListProjectsAdmin();
  const review = useReviewProject();
  const qc = useQueryClient();
  const { toast } = useToast();

  const act = (id: string, decision: "approve" | "reject") => {
    review.mutate(
      { id, data: { decision } },
      {
        onSuccess: (p) => {
          toast({
            title: decision === "approve" ? "Approved" : "Rejected",
            description:
              decision === "approve" ? `Synced ${p.postCount} posts from X.` : "Application rejected.",
          });
          qc.invalidateQueries({ queryKey: getListProjectsAdminQueryKey() });
        },
        onError: () => toast({ title: "Error", description: "Action failed.", variant: "destructive" }),
      },
    );
  };

  const sorted = [...(projects ?? [])].sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9),
  );

  return (
    <div className="space-y-8 relative z-10">
      <div className="border-b-4 border-foreground pb-4">
        <h1 className="text-4xl font-black uppercase tracking-tighter">Project Applications</h1>
        <p className="font-mono text-sm text-muted-foreground mt-1">
          Approve to sync the project's last 20 X posts and feature it publicly. Rewards are always ITC.
        </p>
      </div>

      {isLoading ? (
        <div className="font-mono font-bold uppercase animate-pulse">Loading…</div>
      ) : !sorted.length ? (
        <div className="border-4 border-foreground bg-card p-8 brutal-shadow font-mono uppercase">
          No applications yet.
        </div>
      ) : (
        <div className="grid gap-4">
          {sorted.map((p) => (
            <div
              key={p.id}
              className="border-4 border-foreground bg-card p-6 brutal-shadow flex flex-col md:flex-row md:items-center justify-between gap-4"
              data-testid={`application-${p.xHandle}`}
            >
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-2xl font-black uppercase">{p.name}</h2>
                  <span
                    className={`font-mono text-xs px-2 py-1 uppercase border-2 border-foreground ${
                      p.status === "approved"
                        ? "bg-primary text-primary-foreground"
                        : p.status === "rejected"
                          ? "bg-destructive text-destructive-foreground"
                          : "bg-secondary text-secondary-foreground"
                    }`}
                  >
                    {p.status}
                  </span>
                  {p.status === "approved" && (
                    <span className="font-mono text-xs text-muted-foreground">{p.postCount} posts</span>
                  )}
                </div>
                <a
                  href={`https://x.com/${p.xHandle}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-sm text-primary hover:underline"
                >
                  @{p.xHandle}
                </a>
                <p className="text-muted-foreground line-clamp-2">{p.description}</p>
              </div>

              {p.status === "pending" && (
                <div className="flex gap-2 shrink-0">
                  <Button
                    onClick={() => act(p.id, "approve")}
                    disabled={review.isPending}
                    className="border-2 border-foreground rounded-none brutal-shadow"
                    data-testid={`button-approve-${p.xHandle}`}
                  >
                    Approve
                  </Button>
                  <Button
                    onClick={() => act(p.id, "reject")}
                    disabled={review.isPending}
                    variant="destructive"
                    className="border-2 border-foreground rounded-none brutal-shadow"
                    data-testid={`button-reject-${p.xHandle}`}
                  >
                    Reject
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
