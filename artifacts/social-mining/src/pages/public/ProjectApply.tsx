import { useState } from "react";
import { useApplyProject } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "wouter";

export default function ProjectApply() {
  const [name, setName] = useState("");
  const [xHandle, setXHandle] = useState("");
  const [description, setDescription] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [done, setDone] = useState(false);
  const { toast } = useToast();
  const apply = useApplyProject();

  const submit = () => {
    if (!name || !xHandle) return;
    apply.mutate(
      {
        data: {
          name,
          xHandle: xHandle.replace(/^@/, "").trim(),
          description: description || undefined,
          websiteUrl: websiteUrl || undefined,
        },
      },
      {
        onSuccess: () => {
          setDone(true);
          toast({ title: "Application submitted", description: "We'll review and feature you soon." });
        },
        onError: () =>
          toast({ title: "Error", description: "Could not submit application.", variant: "destructive" }),
      },
    );
  };

  if (done) {
    return (
      <div className="max-w-md mx-auto py-12 text-center space-y-4 animate-in fade-in">
        <h1 className="text-4xl font-black uppercase">Submitted ✓</h1>
        <p className="text-muted-foreground font-mono">
          Your application is pending review. Approved projects appear on the Featured Projects page,
          with their recent posts synced from X.
        </p>
        <Link
          href="/projects"
          className="inline-block bg-foreground text-background px-4 py-2 font-bold uppercase brutal-shadow"
        >
          View Featured Projects
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-8 py-12 animate-in fade-in">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-black uppercase">Apply to Feature</h1>
        <p className="text-muted-foreground font-mono">
          Get featured on the chain. Contributors farm quality replies on your posts — you get the
          reach, they earn ITC.
        </p>
      </div>

      <div className="border-4 border-foreground bg-card p-6 brutal-shadow space-y-4">
        <div className="space-y-2">
          <Label className="font-bold uppercase">Project Name *</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Protocol"
            className="border-2 border-foreground rounded-none shadow-none font-mono"
            data-testid="input-project-name"
          />
        </div>
        <div className="space-y-2">
          <Label className="font-bold uppercase">X Handle *</Label>
          <Input
            value={xHandle}
            onChange={(e) => setXHandle(e.target.value)}
            placeholder="Without @ (e.g. interchained)"
            className="border-2 border-foreground rounded-none shadow-none font-mono"
            data-testid="input-project-handle"
          />
        </div>
        <div className="space-y-2">
          <Label className="font-bold uppercase">Description</Label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What you're building…"
            className="w-full border-2 border-foreground rounded-none shadow-none font-mono p-2 min-h-24 bg-background"
            data-testid="input-project-description"
          />
        </div>
        <div className="space-y-2">
          <Label className="font-bold uppercase">Website</Label>
          <Input
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://…"
            className="border-2 border-foreground rounded-none shadow-none font-mono"
            data-testid="input-project-website"
          />
        </div>
        <Button
          onClick={submit}
          disabled={apply.isPending || !name || !xHandle}
          className="w-full border-2 border-foreground rounded-none brutal-shadow hover:-translate-y-1 transition-all"
          data-testid="button-submit-application"
        >
          {apply.isPending ? "Submitting…" : "Submit Application"}
        </Button>
      </div>
    </div>
  );
}
