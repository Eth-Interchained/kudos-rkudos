import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

// ── Types ────────────────────────────────────────────────────────────────────
interface Topic {
  id: string;
  title: string;
  topic: string;
  requiredKeywords: string[];
  bonusKeywords: string[];
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

const API_BASE = "/api";

// ── API helpers (direct fetch since these aren't in the generated client) ───
async function fetchTopics(): Promise<Topic[]> {
  const res = await fetch(`${API_BASE}/admin/topics`);
  if (!res.ok) throw new Error("Failed to fetch topics");
  return res.json();
}

async function createTopic(data: Partial<Topic>): Promise<Topic> {
  const res = await fetch(`${API_BASE}/admin/topics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create topic");
  return res.json();
}

async function updateTopic(id: string, data: Partial<Topic>): Promise<Topic> {
  const res = await fetch(`${API_BASE}/admin/topics/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update topic");
  return res.json();
}

async function deleteTopic(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/topics/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete topic");
}

async function reorderTopics(ids: string[]): Promise<Topic[]> {
  const res = await fetch(`${API_BASE}/admin/topics/reorder`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error("Failed to reorder topics");
  return res.json();
}

// ── Keyword Chip Input ───────────────────────────────────────────────────────
function KeywordInput({
  label,
  value,
  onChange,
  color = "primary",
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  color?: "primary" | "secondary";
}) {
  const [input, setInput] = useState("");

  const add = () => {
    const trimmed = input.trim().toLowerCase();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setInput("");
  };

  const remove = (kw: string) => {
    onChange(value.filter((v) => v !== kw));
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs font-bold uppercase">{label}</Label>
      <div className="flex flex-wrap gap-1.5 min-h-[32px]">
        {value.map((kw) => (
          <span
            key={kw}
            className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono font-bold border-2 border-foreground ${
              color === "primary"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground"
            }`}
          >
            {kw}
            <button
              onClick={() => remove(kw)}
              className="hover:opacity-60 transition-opacity ml-0.5"
              type="button"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Type keyword + Enter"
          className="text-sm h-8"
        />
        <Button
          onClick={add}
          variant="outline"
          size="sm"
          className="shrink-0 h-8 border-2 border-foreground font-bold"
          type="button"
        >
          Add
        </Button>
      </div>
    </div>
  );
}

// ── Topic Card ───────────────────────────────────────────────────────────────
function TopicCard({
  topic,
  index,
  totalCount,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  topic: Topic;
  index: number;
  totalCount: number;
  onUpdate: (id: string, data: Partial<Topic>) => void;
  onDelete: (id: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(topic.title);
  const [topicPrompt, setTopicPrompt] = useState(topic.topic);
  const [required, setRequired] = useState<string[]>(topic.requiredKeywords);
  const [bonus, setBonus] = useState<string[]>(topic.bonusKeywords);

  const handleSave = () => {
    onUpdate(topic.id, {
      title,
      topic: topicPrompt,
      requiredKeywords: required,
      bonusKeywords: bonus,
    });
    setEditing(false);
  };

  const handleCancel = () => {
    setTitle(topic.title);
    setTopicPrompt(topic.topic);
    setRequired(topic.requiredKeywords);
    setBonus(topic.bonusKeywords);
    setEditing(false);
  };

  return (
    <div
      className={`border-4 border-foreground p-4 brutal-shadow transition-all ${
        !topic.active ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="bg-foreground text-background px-2 py-0.5 font-mono text-xs font-bold shrink-0">
            #{index + 1}
          </span>
          {editing ? (
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-sm font-bold h-8"
            />
          ) : (
            <span className="font-bold text-sm truncate">{topic.title}</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onMoveUp(index)}
            disabled={index === 0}
            className="w-7 h-7 border-2 border-foreground flex items-center justify-center font-bold text-sm hover:bg-muted disabled:opacity-30 transition-colors"
            title="Move up"
          >
            ↑
          </button>
          <button
            onClick={() => onMoveDown(index)}
            disabled={index === totalCount - 1}
            className="w-7 h-7 border-2 border-foreground flex items-center justify-center font-bold text-sm hover:bg-muted disabled:opacity-30 transition-colors"
            title="Move down"
          >
            ↓
          </button>
          <div className="flex items-center gap-1 ml-2">
            <Switch
              checked={topic.active}
              onCheckedChange={(v) => onUpdate(topic.id, { active: v })}
            />
            <span className="text-xs font-mono">{topic.active ? "ON" : "OFF"}</span>
          </div>
        </div>
      </div>

      {editing ? (
        <div className="space-y-3 mt-3">
          <div>
            <Label className="text-xs font-bold uppercase mb-1 block">Topic Prompt</Label>
            <Textarea
              value={topicPrompt}
              onChange={(e) => setTopicPrompt(e.target.value)}
              className="text-sm min-h-[60px] border-2 border-foreground"
              rows={2}
            />
          </div>
          <KeywordInput
            label="Required Keywords"
            value={required}
            onChange={setRequired}
            color="primary"
          />
          <KeywordInput
            label="Bonus Keywords"
            value={bonus}
            onChange={setBonus}
            color="secondary"
          />
          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleSave}
              size="sm"
              className="border-2 border-foreground font-bold bg-primary text-primary-foreground"
            >
              Save
            </Button>
            <Button
              onClick={handleCancel}
              variant="outline"
              size="sm"
              className="border-2 border-foreground font-bold"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-mono">{topic.topic}</p>
          <div className="flex flex-wrap gap-1">
            {topic.requiredKeywords.map((kw) => (
              <span
                key={kw}
                className="px-1.5 py-0.5 text-[10px] font-mono font-bold border-2 border-foreground bg-primary text-primary-foreground"
              >
                {kw}
              </span>
            ))}
            {topic.bonusKeywords.map((kw) => (
              <span
                key={kw}
                className="px-1.5 py-0.5 text-[10px] font-mono border-2 border-foreground bg-secondary text-secondary-foreground"
              >
                +{kw}
              </span>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setEditing(true)}
              className="text-xs font-bold uppercase text-primary hover:underline"
            >
              Edit
            </button>
            <button
              onClick={() => {
                if (confirm(`Delete topic "${topic.title}"?`)) {
                  onDelete(topic.id);
                }
              }}
              className="text-xs font-bold uppercase text-destructive hover:underline"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function TopicPool() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newTopic, setNewTopic] = useState("");
  const [newRequired, setNewRequired] = useState<string[]>([]);
  const [newBonus, setNewBonus] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchTopics();
      setTopics(data);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on mount
  useState(() => {
    load();
  });

  const handleUpdate = async (id: string, data: Partial<Topic>) => {
    try {
      const updated = await updateTopic(id, data);
      setTopics((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTopic(id);
      setTopics((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleMoveUp = async (index: number) => {
    if (index === 0) return;
    const newTopics = [...topics];
    [newTopics[index - 1], newTopics[index]] = [newTopics[index], newTopics[index - 1]];
    setTopics(newTopics);
    try {
      const reordered = await reorderTopics(newTopics.map((t) => t.id));
      setTopics(reordered);
    } catch (e) {
      setError((e as Error).message);
      load();
    }
  };

  const handleMoveDown = async (index: number) => {
    if (index >= topics.length - 1) return;
    const newTopics = [...topics];
    [newTopics[index], newTopics[index + 1]] = [newTopics[index + 1], newTopics[index]];
    setTopics(newTopics);
    try {
      const reordered = await reorderTopics(newTopics.map((t) => t.id));
      setTopics(reordered);
    } catch (e) {
      setError((e as Error).message);
      load();
    }
  };

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    try {
      const created = await createTopic({
        title: newTitle.trim(),
        topic: newTopic.trim(),
        requiredKeywords: newRequired,
        bonusKeywords: newBonus,
      });
      setTopics((prev) => [...prev, created]);
      setNewTitle("");
      setNewTopic("");
      setNewRequired([]);
      setNewBonus([]);
      setShowNew(false);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-black uppercase tracking-tighter border-b-4 border-foreground pb-3">
          Topic Pool
        </h1>
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm text-muted-foreground">
            {topics.filter((t) => t.active).length} active / {topics.length} total
          </span>
          <Button
            onClick={() => setShowNew(true)}
            className="border-2 border-foreground font-bold bg-primary text-primary-foreground"
          >
            + New Topic
          </Button>
        </div>
      </div>

      {error && (
        <div className="border-4 border-destructive bg-destructive/10 p-4 font-mono text-sm text-destructive font-bold">
          {error}
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        Topics rotate automatically for auto-mined blocks. Each topic defines the
        post prompt and the required/bonus keywords miners must include in their replies.
        Drag topics to reorder. Toggle to skip.
      </p>

      {/* New Topic Form */}
      {showNew && (
        <div className="border-4 border-primary bg-primary/5 p-4 brutal-shadow space-y-3">
          <h3 className="font-bold uppercase text-sm">New Topic</h3>
          <div>
            <Label className="text-xs font-bold uppercase mb-1 block">Title</Label>
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Why verifiable beats trusted"
              className="border-2 border-foreground"
            />
          </div>
          <div>
            <Label className="text-xs font-bold uppercase mb-1 block">Topic Prompt</Label>
            <Textarea
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
              placeholder="The topic description fed to AI for post generation..."
              className="border-2 border-foreground min-h-[60px]"
              rows={2}
            />
          </div>
          <KeywordInput
            label="Required Keywords"
            value={newRequired}
            onChange={setNewRequired}
            color="primary"
          />
          <KeywordInput
            label="Bonus Keywords"
            value={newBonus}
            onChange={setNewBonus}
            color="secondary"
          />
          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleCreate}
              className="border-2 border-foreground font-bold bg-primary text-primary-foreground"
            >
              Create Topic
            </Button>
            <Button
              onClick={() => setShowNew(false)}
              variant="outline"
              className="border-2 border-foreground font-bold"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Topic List */}
      {loading ? (
        <div className="text-center py-12 font-mono text-muted-foreground">Loading topics...</div>
      ) : (
        <div className="space-y-3">
          {topics.map((topic, index) => (
            <TopicCard
              key={topic.id}
              topic={topic}
              index={index}
              totalCount={topics.length}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              onMoveUp={handleMoveUp}
              onMoveDown={handleMoveDown}
            />
          ))}
          {topics.length === 0 && (
            <div className="text-center py-12 font-mono text-muted-foreground border-4 border-dashed border-foreground/20">
              No topics yet. Click "+ New Topic" to create one.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
