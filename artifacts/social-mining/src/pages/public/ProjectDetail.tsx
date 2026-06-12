import {
  useGetFeaturedProject,
  getGetFeaturedProjectQueryKey,
} from "@workspace/api-client-react";
import { useParams, Link } from "wouter";

export default function ProjectDetail() {
  const params = useParams();
  const id = params.id || "";
  const { data, isLoading } = useGetFeaturedProject(id, {
    query: { enabled: !!id, queryKey: getGetFeaturedProjectQueryKey(id) },
  });

  if (isLoading)
    return (
      <div className="p-8 text-center font-mono font-bold uppercase animate-pulse">
        Loading…
      </div>
    );
  if (!data)
    return (
      <div className="p-8 text-center font-mono font-bold uppercase text-destructive">
        Project not found
      </div>
    );

  const { project, posts } = data;

  return (
    <div className="space-y-8 animate-in fade-in">
      <Link href="/projects" className="font-mono text-sm uppercase underline">
        ← All projects
      </Link>

      <div className="border-4 border-foreground p-8 bg-card brutal-shadow space-y-3">
        <h1 className="text-4xl font-black uppercase tracking-tighter">{project.name}</h1>
        <a
          href={`https://x.com/${project.xHandle}`}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-primary hover:underline inline-block"
        >
          @{project.xHandle}
        </a>
        <p className="text-muted-foreground">{project.description}</p>
        {project.websiteUrl && (
          <a
            href={project.websiteUrl}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-sm underline block"
          >
            {project.websiteUrl}
          </a>
        )}
      </div>

      <div className="space-y-4">
        <h2 className="text-2xl font-black uppercase border-b-4 border-foreground pb-2">
          Recent Posts ({posts.length})
        </h2>
        {!posts.length ? (
          <div className="font-mono text-sm text-muted-foreground">
            No posts synced for this project yet.
          </div>
        ) : (
          <div className="grid gap-3">
            {posts.map((post) => (
              <a
                key={post.id}
                href={post.xPostUrl}
                target="_blank"
                rel="noreferrer"
                className="border-4 border-foreground bg-card p-4 brutal-shadow hover:bg-secondary/10 transition-colors block"
                data-testid={`post-${post.xPostId}`}
              >
                <p className="line-clamp-3">{post.text || "(no text)"}</p>
                <span className="font-mono text-xs text-muted-foreground mt-2 block break-all">
                  {post.xPostUrl}
                </span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
