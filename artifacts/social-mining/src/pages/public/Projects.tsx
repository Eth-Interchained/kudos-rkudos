import { useListFeaturedProjects } from "@workspace/api-client-react";
import { Link } from "wouter";

export default function Projects() {
  const { data: projects, isLoading } = useListFeaturedProjects();

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b-4 border-foreground pb-4">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tighter">Featured Projects</h1>
          <p className="font-mono text-sm text-muted-foreground mt-1">
            Partners featured on the chain. Reply to their posts in mining blocks to earn ITC.
          </p>
        </div>
        <Link
          href="/apply"
          className="bg-foreground text-background px-4 py-2 font-bold uppercase brutal-shadow hover:bg-primary hover:text-primary-foreground transition-colors whitespace-nowrap"
          data-testid="link-apply-project"
        >
          Apply to Feature →
        </Link>
      </div>

      {isLoading ? (
        <div className="font-mono font-bold uppercase animate-pulse">Loading…</div>
      ) : !projects?.length ? (
        <div className="border-4 border-foreground bg-card p-8 brutal-shadow text-center font-mono uppercase">
          No featured projects yet.{" "}
          <Link href="/apply" className="underline">
            Be the first to apply.
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className="block"
              data-testid={`card-project-${p.xHandle}`}
            >
              <div className="border-4 border-foreground bg-card p-6 brutal-shadow space-y-3 hover:bg-secondary/10 transition-colors h-full">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-2xl font-black uppercase">{p.name}</h2>
                  <span className="font-mono text-xs bg-foreground text-background px-2 py-1 whitespace-nowrap">
                    {p.postCount} posts
                  </span>
                </div>
                <div className="font-mono text-sm text-primary">@{p.xHandle}</div>
                <p className="text-muted-foreground line-clamp-3">{p.description}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
