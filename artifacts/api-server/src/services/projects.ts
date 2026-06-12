import type { Logger } from "pino";
import { eq, desc } from "drizzle-orm";
import {
  db,
  projectsTable,
  projectPostsTable,
  type Project,
  type ProjectPost,
} from "@workspace/db";
import { fetchRecentUserPosts } from "./integrations/netrows";
import { recordAudit } from "./audit";

export async function applyProject(input: {
  name: string;
  xHandle: string;
  description?: string;
  websiteUrl?: string;
}): Promise<Project> {
  const handle = input.xHandle.replace(/^@/, "").trim();
  const inserted = await db
    .insert(projectsTable)
    .values({
      name: input.name.trim(),
      xHandle: handle,
      description: input.description?.trim() ?? "",
      websiteUrl: input.websiteUrl?.trim() || null,
      status: "pending",
    })
    .returning();
  await recordAudit({
    actor: handle,
    action: "project.applied",
    entity: "project",
    entityId: inserted[0].id,
    detail: { name: inserted[0].name, xHandle: handle },
  });
  return inserted[0];
}

export async function listProjects(status?: string): Promise<Project[]> {
  if (status) {
    return db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.status, status))
      .orderBy(desc(projectsTable.appliedAt));
  }
  return db.select().from(projectsTable).orderBy(desc(projectsTable.appliedAt));
}

async function countPosts(projectId: string): Promise<number> {
  const rows = await db
    .select({ id: projectPostsTable.id })
    .from(projectPostsTable)
    .where(eq(projectPostsTable.projectId, projectId));
  return rows.length;
}

export async function listProjectsWithCounts(
  status?: string,
): Promise<Array<{ project: Project; postCount: number }>> {
  const projects = await listProjects(status);
  const out: Array<{ project: Project; postCount: number }> = [];
  for (const project of projects) {
    out.push({ project, postCount: await countPosts(project.id) });
  }
  return out;
}

export async function getProject(
  id: string,
): Promise<{ project: Project; posts: ProjectPost[] } | null> {
  const found = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, id))
    .limit(1);
  if (!found[0]) return null;
  const posts = await db
    .select()
    .from(projectPostsTable)
    .where(eq(projectPostsTable.projectId, id))
    .orderBy(desc(projectPostsTable.syncedAt));
  return { project: found[0], posts };
}

export interface ReviewResult {
  project: Project;
  postCount: number;
}

export async function reviewProject(
  id: string,
  decision: "approve" | "reject",
  opts: { reason?: string; actor?: string },
  log?: Logger,
): Promise<ReviewResult | null> {
  const found = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, id))
    .limit(1);
  const project = found[0];
  if (!project) return null;
  const now = new Date().toISOString();

  if (decision === "reject") {
    const updated = await db
      .update(projectsTable)
      .set({ status: "rejected", rejectionReason: opts.reason ?? null, reviewedAt: now })
      .where(eq(projectsTable.id, id))
      .returning();
    await recordAudit({
      actor: opts.actor ?? "admin",
      action: "project.rejected",
      entity: "project",
      entityId: id,
      detail: { reason: opts.reason ?? null },
    });
    return { project: updated[0], postCount: 0 };
  }

  // Approve: pull the project's recent posts (best-effort; null in sim mode).
  const posts = await fetchRecentUserPosts(project.xHandle, 20, log);
  let postCount = 0;
  if (posts && posts.length) {
    for (const p of posts) {
      await db
        .insert(projectPostsTable)
        .values({
          projectId: id,
          xPostId: p.id,
          xPostUrl: p.url,
          text: p.text,
        })
        .onConflictDoNothing();
    }
    postCount = await countPosts(id);
  }

  const updated = await db
    .update(projectsTable)
    .set({ status: "approved", rejectionReason: null, reviewedAt: now })
    .where(eq(projectsTable.id, id))
    .returning();
  await recordAudit({
    actor: opts.actor ?? "admin",
    action: "project.approved",
    entity: "project",
    entityId: id,
    detail: { xHandle: project.xHandle, postsSynced: postCount },
  });
  return { project: updated[0], postCount };
}
