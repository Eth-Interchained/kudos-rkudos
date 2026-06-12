import * as React from "react";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import {
  adminGetFlags,
  adminResolveFlag,
  adminTriageFlag,
  getCategories,
  adminUpsertCategory,
  adminGrantModerator,
  type ForumCategory,
} from "@/lib/forumApi";

// ── helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Flag Queue ────────────────────────────────────────────────────────────────

interface FlagItem {
  flag: Record<string, unknown>;
  post: {
    id: string;
    rawMd: string;
    status: string;
    createdAt: string;
  };
}

function FlagRow({ item }: { item: FlagItem }) {
  const qc = useQueryClient();
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [triaging, setTriaging] = useState(false);

  const flagId = item.flag.id as string;
  const reason = (item.flag.reason as string) ?? "—";
  const createdAt = (item.flag.createdAt as string) ?? "";
  const snippet = item.post.rawMd.slice(0, 120) + (item.post.rawMd.length > 120 ? "…" : "");

  const resolveMut = useMutation({
    mutationFn: (resolution: "upheld" | "rejected") =>
      adminResolveFlag(flagId, resolution),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["forum-flags"] });
      toast({ title: "Flag resolved" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleTriage = async () => {
    setTriaging(true);
    try {
      const result = await adminTriageFlag(flagId);
      setSuggestion(result.available ? (result.suggestion ?? "No suggestion text") : "AiAS unavailable");
    } catch (e) {
      setSuggestion("Triage request failed");
    } finally {
      setTriaging(false);
    }
  };

  return (
    <tr className="border-b-4 border-foreground hover:bg-muted/50 transition-colors align-top">
      <td className="p-4 border-r-4 border-foreground font-mono text-xs max-w-[280px]">
        <p className="line-clamp-3 text-muted-foreground">{snippet}</p>
      </td>
      <td className="p-4 border-r-4 border-foreground font-mono text-xs font-bold uppercase">
        {reason}
      </td>
      <td className="p-4 border-r-4 border-foreground font-mono text-xs text-muted-foreground whitespace-nowrap">
        {createdAt ? relativeTime(createdAt) : "—"}
      </td>
      <td className="p-4 space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={triaging}
            onClick={handleTriage}
            className="rounded-none border-2 border-foreground brutal-shadow h-8 text-xs"
          >
            {triaging ? "…" : "Triage (AiAS)"}
          </Button>
          <Button
            size="sm"
            disabled={resolveMut.isPending}
            onClick={() => resolveMut.mutate("upheld")}
            className="rounded-none border-2 border-foreground brutal-shadow h-8 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Uphold
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={resolveMut.isPending}
            onClick={() => resolveMut.mutate("rejected")}
            className="rounded-none border-2 border-foreground brutal-shadow h-8 text-xs"
          >
            Reject
          </Button>
        </div>
        {suggestion !== null && (
          <div className="border-2 border-foreground bg-muted/30 px-2 py-1.5 font-mono text-[11px] text-muted-foreground max-w-[320px]">
            <span className="font-bold text-foreground uppercase text-[9px] block mb-0.5">AiAS</span>
            {suggestion}
          </div>
        )}
      </td>
    </tr>
  );
}

function FlagQueue() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["forum-flags"],
    queryFn: adminGetFlags,
  });

  if (isLoading) return (
    <div className="p-8 text-center font-mono text-muted-foreground animate-pulse">Loading flags…</div>
  );
  if (error) return (
    <div className="border-4 border-destructive bg-destructive/10 p-4 font-mono text-sm text-destructive font-bold">
      {(error as Error).message}
    </div>
  );

  const flags = (data ?? []) as FlagItem[];

  return (
    <div className="border-4 border-foreground bg-card overflow-x-auto brutal-shadow">
      <table className="w-full text-left font-mono text-sm">
        <thead className="bg-muted border-b-4 border-foreground uppercase">
          <tr>
            <th className="p-4 border-r-4 border-foreground text-xs">Post (truncated)</th>
            <th className="p-4 border-r-4 border-foreground text-xs">Reason</th>
            <th className="p-4 border-r-4 border-foreground text-xs">Flagged</th>
            <th className="p-4 text-xs">Actions</th>
          </tr>
        </thead>
        <tbody>
          {flags.length === 0 ? (
            <tr>
              <td colSpan={4} className="p-8 text-center font-bold uppercase text-muted-foreground">
                No open flags
              </td>
            </tr>
          ) : (
            flags.map((item) => (
              <FlagRow key={item.flag.id as string} item={item} />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Categories ────────────────────────────────────────────────────────────────

const EMPTY_FORM: Partial<ForumCategory> & { slug: string; name: string } = {
  slug: "",
  name: "",
  description: "",
  sortOrder: 0,
  minTrustLevel: 0,
  miningEligible: false,
  active: true,
};

function CategoryForm({ initial, onDone }: {
  initial?: ForumCategory;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<typeof EMPTY_FORM>(
    initial
      ? {
          slug: initial.slug,
          name: initial.name,
          description: initial.description,
          sortOrder: initial.sortOrder,
          minTrustLevel: initial.minTrustLevel,
          miningEligible: initial.miningEligible,
          active: initial.active,
        }
      : { ...EMPTY_FORM }
  );

  const mut = useMutation({
    mutationFn: () => adminUpsertCategory({ ...form, slug: form.slug, name: form.name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["forum-categories"] });
      toast({ title: initial ? "Category updated" : "Category created" });
      if (!initial) setForm({ ...EMPTY_FORM });
      onDone?.();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const field = (key: keyof typeof EMPTY_FORM) => ({
    value: String(form[key] ?? ""),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value })),
  });

  return (
    <div className="border-4 border-foreground bg-card p-4 brutal-shadow space-y-4">
      <h3 className="font-black uppercase text-sm">
        {initial ? `Edit: ${initial.slug}` : "New Category"}
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label className="text-xs font-bold uppercase">Slug *</Label>
          <Input {...field("slug")} placeholder="e.g. announcements" className="border-2 border-foreground rounded-none shadow-none font-mono" disabled={!!initial} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-bold uppercase">Name *</Label>
          <Input {...field("name")} placeholder="e.g. Announcements" className="border-2 border-foreground rounded-none shadow-none font-mono" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-bold uppercase">Sort Order</Label>
          <Input
            type="number"
            value={String(form.sortOrder ?? 0)}
            onChange={(e) => setForm((p) => ({ ...p, sortOrder: parseInt(e.target.value, 10) || 0 }))}
            className="border-2 border-foreground rounded-none shadow-none font-mono"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-bold uppercase">Min Trust Level</Label>
          <Input
            type="number"
            value={String(form.minTrustLevel ?? 0)}
            onChange={(e) => setForm((p) => ({ ...p, minTrustLevel: parseInt(e.target.value, 10) || 0 }))}
            className="border-2 border-foreground rounded-none shadow-none font-mono"
          />
        </div>
        <div className="md:col-span-2 space-y-1">
          <Label className="text-xs font-bold uppercase">Description</Label>
          <Textarea {...field("description")} rows={2} className="border-2 border-foreground rounded-none shadow-none font-mono text-sm" />
        </div>
      </div>

      <div className="flex flex-wrap gap-6">
        <div className="flex items-center gap-2">
          <Switch
            checked={!!form.miningEligible}
            onCheckedChange={(v) => setForm((p) => ({ ...p, miningEligible: v }))}
          />
          <Label className="text-xs font-bold uppercase">Mining Eligible</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={!!form.active}
            onCheckedChange={(v) => setForm((p) => ({ ...p, active: v }))}
          />
          <Label className="text-xs font-bold uppercase">Active</Label>
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <Button
          onClick={() => mut.mutate()}
          disabled={mut.isPending || !form.slug || !form.name}
          className="rounded-none border-2 border-foreground brutal-shadow bg-primary text-primary-foreground"
        >
          {mut.isPending ? "Saving…" : initial ? "Update" : "Create Category"}
        </Button>
        {onDone && (
          <Button
            variant="outline"
            onClick={onDone}
            className="rounded-none border-2 border-foreground brutal-shadow"
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

function Categories() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["forum-categories"],
    queryFn: getCategories,
  });
  const [editSlug, setEditSlug] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  if (isLoading) return (
    <div className="p-8 text-center font-mono text-muted-foreground animate-pulse">Loading categories…</div>
  );
  if (error) return (
    <div className="border-4 border-destructive bg-destructive/10 p-4 font-mono text-sm text-destructive font-bold">
      {(error as Error).message}
    </div>
  );

  const cats = data ?? [];

  return (
    <div className="space-y-4">
      {/* Existing categories */}
      <div className="border-4 border-foreground bg-card overflow-x-auto brutal-shadow">
        <table className="w-full text-left font-mono text-sm">
          <thead className="bg-muted border-b-4 border-foreground uppercase">
            <tr>
              <th className="p-4 border-r-4 border-foreground text-xs">Slug</th>
              <th className="p-4 border-r-4 border-foreground text-xs">Name</th>
              <th className="p-4 border-r-4 border-foreground text-xs">Sort</th>
              <th className="p-4 border-r-4 border-foreground text-xs">Trust</th>
              <th className="p-4 border-r-4 border-foreground text-xs">Flags</th>
              <th className="p-4 text-xs">Edit</th>
            </tr>
          </thead>
          <tbody>
            {cats.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center font-bold uppercase text-muted-foreground">
                  No categories
                </td>
              </tr>
            ) : (
              cats.map((c) => (
                <tr key={c.id} className="border-b-4 border-foreground hover:bg-muted/50 transition-colors">
                  <td className="p-4 border-r-4 border-foreground font-bold">{c.slug}</td>
                  <td className="p-4 border-r-4 border-foreground">{c.name}</td>
                  <td className="p-4 border-r-4 border-foreground text-center">{c.sortOrder}</td>
                  <td className="p-4 border-r-4 border-foreground text-center">{c.minTrustLevel}</td>
                  <td className="p-4 border-r-4 border-foreground">
                    <div className="flex gap-1 flex-wrap">
                      {c.miningEligible && (
                        <Badge variant="default" className="text-[10px] px-1.5 py-0 rounded-none border border-foreground">mining</Badge>
                      )}
                      {c.active
                        ? <Badge variant="secondary" className="text-[10px] px-1.5 py-0 rounded-none border border-foreground">active</Badge>
                        : <Badge variant="outline" className="text-[10px] px-1.5 py-0 rounded-none">inactive</Badge>
                      }
                    </div>
                  </td>
                  <td className="p-4">
                    <button
                      onClick={() => setEditSlug(editSlug === c.slug ? null : c.slug)}
                      className="text-xs font-bold uppercase text-primary hover:underline"
                    >
                      {editSlug === c.slug ? "Close" : "Edit"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Inline edit form */}
      {editSlug !== null && (() => {
        const cat = cats.find((c) => c.slug === editSlug);
        return cat ? (
          <CategoryForm initial={cat} onDone={() => setEditSlug(null)} />
        ) : null;
      })()}

      {/* New category form */}
      {showNew ? (
        <CategoryForm onDone={() => setShowNew(false)} />
      ) : (
        <Button
          onClick={() => setShowNew(true)}
          className="rounded-none border-2 border-foreground brutal-shadow bg-primary text-primary-foreground"
        >
          + New Category
        </Button>
      )}
    </div>
  );
}

// ── Moderators ────────────────────────────────────────────────────────────────

function Moderators() {
  const [participantId, setParticipantId] = useState("");
  const [result, setResult] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) =>
      adminGrantModerator(id, on),
    onSuccess: (_, vars) => {
      setResult(vars.on ? "Moderator granted." : "Moderator revoked.");
      setParticipantId("");
    },
    onError: (e: Error) => {
      setResult(`Error: ${e.message}`);
    },
  });

  const act = (on: boolean) => {
    if (!participantId.trim()) return;
    setResult(null);
    mut.mutate({ id: participantId.trim(), on });
  };

  return (
    <div className="border-4 border-foreground bg-card p-6 brutal-shadow space-y-4">
      <div>
        <h2 className="text-xl font-black uppercase">Grant / Revoke Moderator</h2>
        <p className="text-xs font-mono text-muted-foreground mt-1">
          Enter a participant ID and choose Grant or Revoke.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-end">
        <div className="space-y-1 flex-1">
          <Label className="text-xs font-bold uppercase">Participant ID</Label>
          <Input
            value={participantId}
            onChange={(e) => setParticipantId(e.target.value)}
            placeholder="e.g. part_abc123"
            className="border-2 border-foreground rounded-none shadow-none font-mono"
          />
        </div>
        <div className="flex gap-2">
          <Button
            disabled={mut.isPending || !participantId.trim()}
            onClick={() => act(true)}
            className="rounded-none border-2 border-foreground brutal-shadow bg-primary text-primary-foreground"
          >
            Grant
          </Button>
          <Button
            variant="outline"
            disabled={mut.isPending || !participantId.trim()}
            onClick={() => act(false)}
            className="rounded-none border-2 border-destructive text-destructive hover:bg-destructive hover:text-white brutal-shadow"
          >
            Revoke
          </Button>
        </div>
      </div>

      {result && (
        <div className={`border-2 p-3 font-mono text-sm font-bold ${result.startsWith("Error") ? "border-destructive text-destructive bg-destructive/10" : "border-foreground bg-muted"}`}>
          {result}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ForumModeration() {
  return (
    <div className="space-y-8 animate-in fade-in">
      <h1 className="text-4xl font-black uppercase border-b-4 border-foreground pb-4">
        Forum Moderation
      </h1>

      <Tabs defaultValue="flags" className="w-full">
        <TabsList className="border-4 border-foreground rounded-none bg-muted gap-0 h-auto p-0">
          <TabsTrigger
            value="flags"
            className="rounded-none px-6 py-2 font-black uppercase text-sm border-r-4 border-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            Flag Queue
          </TabsTrigger>
          <TabsTrigger
            value="categories"
            className="rounded-none px-6 py-2 font-black uppercase text-sm border-r-4 border-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            Categories
          </TabsTrigger>
          <TabsTrigger
            value="moderators"
            className="rounded-none px-6 py-2 font-black uppercase text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            Moderators
          </TabsTrigger>
        </TabsList>

        <TabsContent value="flags" className="mt-6">
          <FlagQueue />
        </TabsContent>

        <TabsContent value="categories" className="mt-6">
          <Categories />
        </TabsContent>

        <TabsContent value="moderators" className="mt-6">
          <Moderators />
        </TabsContent>
      </Tabs>
    </div>
  );
}
