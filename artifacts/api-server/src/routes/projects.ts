import { Router, type IRouter } from "express";
import {
  ApplyProjectBody,
  ApplyProjectResponse,
  ListFeaturedProjectsResponse,
  GetFeaturedProjectResponse,
  ListProjectsAdminResponse,
  ReviewProjectBody,
  ReviewProjectResponse,
} from "@workspace/api-zod";
import {
  applyProject,
  getProject,
  listProjectsWithCounts,
  reviewProject,
} from "../services/projects";
import { toProjectDto, toProjectPostDto } from "../services/mappers";
import { requireAdmin } from "../middleware/adminAuth";

const router: IRouter = Router();

// ---- Public ---------------------------------------------------------------

router.post("/projects", async (req, res) => {
  const body = ApplyProjectBody.parse(req.body);
  const project = await applyProject(body);
  res.json(ApplyProjectResponse.parse(toProjectDto(project)));
});

router.get("/projects", async (_req, res) => {
  const rows = await listProjectsWithCounts("approved");
  res.json(
    ListFeaturedProjectsResponse.parse(
      rows.map((r) => toProjectDto(r.project, r.postCount)),
    ),
  );
});

router.get("/projects/:id", async (req, res) => {
  const raw = req.params.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  const found = await getProject(id);
  if (!found || found.project.status !== "approved") {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json(
    GetFeaturedProjectResponse.parse({
      project: toProjectDto(found.project, found.posts.length),
      posts: found.posts.map(toProjectPostDto),
    }),
  );
});

// ---- Admin ----------------------------------------------------------------

router.get("/admin/projects", requireAdmin, async (req, res) => {
  const status =
    typeof req.query.status === "string" ? req.query.status : undefined;
  const rows = await listProjectsWithCounts(status);
  res.json(
    ListProjectsAdminResponse.parse(
      rows.map((r) => toProjectDto(r.project, r.postCount)),
    ),
  );
});

router.post("/admin/projects/:id/review", requireAdmin, async (req, res) => {
  const raw = req.params.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  const body = ReviewProjectBody.parse(req.body);
  const result = await reviewProject(
    id,
    body.decision,
    { reason: body.reason, actor: "admin" },
    req.log,
  );
  if (!result) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json(
    ReviewProjectResponse.parse(
      toProjectDto(result.project, result.postCount),
    ),
  );
});

export default router;
