import { useState } from "react";
import { 
  useListBlocks, 
  useCreateBlock, 
  useAdvanceBlock, 
  useSettleBlock, 
  useSubmitReply,
  useGetSettings,
  useUpdateSettings,
  useSyncBlock,
  useGenerateBlockPost,
  useAttachBlockPost,
  useImportXPosts,
  useListSubscribers,
  useListBlastRuns,
  useRunBlast,
  getListBlocksQueryKey,
  getListRepliesQueryKey,
  getGetLeaderboardQueryKey,
  getGetSettingsQueryKey,
  getListBlastRunsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatItc } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export default function ManageBlocks() {
  const { data: blocks } = useListBlocks();
  const { data: settings } = useGetSettings();
  const create = useCreateBlock();
  const advance = useAdvanceBlock();
  const settle = useSettleBlock();
  const submitReply = useSubmitReply();
  const updateSettings = useUpdateSettings();
  const syncBlock = useSyncBlock();
  const generatePost = useGenerateBlockPost();
  const attachPost = useAttachBlockPost();
  const importPosts = useImportXPosts();
  const { data: subscribers } = useListSubscribers();
  const { data: blastRuns } = useListBlastRuns();
  const runBlast = useRunBlast();
  const queryClient = useQueryClient();

  const [newBlock, setNewBlock] = useState({ title: "", topic: "", rewardItc: 1000 });
  const [manualReply, setManualReply] = useState<{seq: number, handle: string, replyText: string} | null>(null);
  const [attachUrl, setAttachUrl] = useState<{ seq: number, url: string } | null>(null);
  const [syncResult, setSyncResult] = useState<{ seq: number, message: string } | null>(null);
  const [startHeight, setStartHeight] = useState<string>("");
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [blastMsg, setBlastMsg] = useState<string | null>(null);

  const invalidateBlock = (seq: number) => {
    queryClient.invalidateQueries({ queryKey: getListBlocksQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetLeaderboardQueryKey(seq) });
    queryClient.invalidateQueries({ queryKey: getListRepliesQueryKey(seq) });
  };

  const handleCreate = () => {
    if (!newBlock.title || !newBlock.topic) return;
    create.mutate({ 
      data: newBlock
    }, {
      onSuccess: () => {
        setNewBlock({ title: "", topic: "", rewardItc: 1000 });
        queryClient.invalidateQueries({ queryKey: getListBlocksQueryKey() });
      }
    });
  };

  const handleAdvance = (seq: number, action: string) => {
    advance.mutate({ seq, data: { action } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListBlocksQueryKey() })
    });
  };

  const handleSettle = (seq: number) => {
    settle.mutate({ seq }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListBlocksQueryKey() })
    });
  };

  const handleSubmitReply = (seq: number) => {
    if (!manualReply || !manualReply.handle || !manualReply.replyText) return;
    submitReply.mutate({
      seq,
      data: { handle: manualReply.handle, replyText: manualReply.replyText }
    }, {
      onSuccess: () => {
        setManualReply(null);
        invalidateBlock(seq);
      }
    });
  };

  const handleToggleAutoPost = (checked: boolean) => {
    updateSettings.mutate({ data: { autoPostEnabled: checked } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() })
    });
  };

  const handleToggleRewards = (checked: boolean) => {
    updateSettings.mutate({ data: { rewardsEnabled: checked } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() })
    });
  };

  const handleToggleBlast = (checked: boolean) => {
    updateSettings.mutate({ data: { blastEnabled: checked } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() })
    });
  };

  const handleToggleReplySync = (checked: boolean) => {
    updateSettings.mutate({ data: { replySyncEnabled: checked } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() })
    });
  };

  const handleRunBlast = () => {
    runBlast.mutate(undefined, {
      onSuccess: (res) => {
        const msg =
          res.status === "sent"
            ? `Sent to ${res.recipientCount ?? 0} subscriber(s).`
            : res.status === "skipped"
              ? res.reason === "already-ran"
                ? `Already sent this week (${res.periodKey}).`
                : "Blast is disabled."
              : "Blast failed.";
        setBlastMsg(msg);
        queryClient.invalidateQueries({ queryKey: getListBlastRunsQueryKey() });
      },
      onError: (err: unknown) => {
        const description =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          "Blast failed. Check SMTP settings.";
        setBlastMsg(description);
        queryClient.invalidateQueries({ queryKey: getListBlastRunsQueryKey() });
      },
    });
  };

  const handleImportPosts = () => {
    importPosts.mutate(undefined, {
      onSuccess: (res) => {
        setImportMsg(
          res.available === 0
            ? "No reference posts found. Run scripts/import_x_posts.py first."
            : `Imported ${res.imported} post(s) as past blocks (${res.skipped} already present).`,
        );
        queryClient.invalidateQueries({ queryKey: getListBlocksQueryKey() });
      },
    });
  };

  const handleSetStartHeight = () => {
    const h = Number(startHeight);
    if (!Number.isInteger(h) || h < 0) return;
    updateSettings.mutate({ data: { miningStartHeight: h } }, {
      onSuccess: () => {
        setStartHeight("");
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      },
    });
  };

  const handleSync = (seq: number) => {
    syncBlock.mutate({ seq }, {
      onSuccess: (res) => {
        setSyncResult({ seq, message: res.message });
        invalidateBlock(seq);
      }
    });
  };

  const handleGeneratePost = (seq: number) => {
    generatePost.mutate({ seq }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListBlocksQueryKey() })
    });
  };

  const handleAttachPost = (seq: number) => {
    if (!attachUrl || attachUrl.seq !== seq || !attachUrl.url) return;
    attachPost.mutate({ seq, data: { xPostUrl: attachUrl.url } }, {
      onSuccess: () => {
        setAttachUrl(null);
        queryClient.invalidateQueries({ queryKey: getListBlocksQueryKey() });
      }
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b-4 border-foreground pb-4">
        <h1 className="text-4xl font-black uppercase">Manage Blocks</h1>
        <div className="flex flex-col sm:flex-row gap-4">
          <div
            className={`flex items-center gap-4 border-4 border-foreground p-4 brutal-shadow ${
              settings && settings.rewardsEnabled === false ? "bg-destructive/15" : "bg-card"
            }`}
          >
            <div>
              <div className="font-black uppercase text-sm">
                Rewards {settings && settings.rewardsEnabled === false ? "Paused" : "Enabled"}
              </div>
              <div className="font-mono text-xs text-muted-foreground">
                Master switch — pause settling &amp; freeze the countdown
              </div>
            </div>
            <Switch
              checked={settings?.rewardsEnabled ?? true}
              onCheckedChange={handleToggleRewards}
              disabled={updateSettings.isPending}
            />
          </div>
          <div className="flex items-center gap-4 border-4 border-foreground bg-card p-4 brutal-shadow">
            <div>
              <div className="font-black uppercase text-sm">Fully Automate Posting</div>
              <div className="font-mono text-xs text-muted-foreground">Auto-publish AiAS posts to X while offline</div>
            </div>
            <Switch
              checked={settings?.autoPostEnabled ?? false}
              onCheckedChange={handleToggleAutoPost}
              disabled={updateSettings.isPending}
            />
          </div>
          <div className="flex items-center gap-4 border-4 border-foreground bg-card p-4 brutal-shadow">
            <div>
              <div className="font-black uppercase text-sm">
                Auto Reply Sync {settings?.replySyncEnabled ? "On" : "Off"}
              </div>
              <div className="font-mono text-xs text-muted-foreground">
                Pull live replies for the {settings?.blockIntervalMinutes ?? 10}-min window every 10 min
              </div>
            </div>
            <Switch
              checked={settings?.replySyncEnabled ?? false}
              onCheckedChange={handleToggleReplySync}
              disabled={updateSettings.isPending}
              data-testid="switch-reply-sync"
            />
          </div>
        </div>
      </div>

      {settings && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="border-2 border-foreground bg-muted/30 p-3 font-mono text-xs">
            <div className="text-muted-foreground uppercase">Cadence</div>
            <div className="font-black text-base">{settings.blockIntervalMinutes} min / block</div>
          </div>
          <div className="border-2 border-foreground bg-muted/30 p-3 font-mono text-xs">
            <div className="text-muted-foreground uppercase">Block Reward</div>
            <div className="font-black text-base">{formatItc(settings.blockRewardItc)} ITC</div>
          </div>
          <div className="border-2 border-foreground bg-muted/30 p-3 font-mono text-xs">
            <div className="text-muted-foreground uppercase">Data Source</div>
            <div className="font-black text-base uppercase">{settings.dataSource}</div>
          </div>
          <div className="border-2 border-foreground bg-muted/30 p-3 font-mono text-xs">
            <div className="text-muted-foreground uppercase">Mining Starts At</div>
            <div className="font-black text-base">#{settings.miningStartHeight}</div>
          </div>
        </div>
      )}

      <div className="border-4 border-foreground bg-card p-6 brutal-shadow space-y-4">
        <h2 className="text-2xl font-black uppercase">Import X Posts &amp; Mining Start</h2>
        <p className="text-sm font-mono text-muted-foreground">
          Run <code className="bg-muted px-1">python scripts/import_x_posts.py</code> to pull @interchained posts via NetRows,
          then import them as reward-earning blocks at the lowest heights (earliest post = block 0). Each carries its halving
          subsidy and lands "closed" — sync its replies, then settle to distribute the reward.
        </p>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2 border-2 border-foreground p-4 bg-muted/30">
            <Label className="font-bold uppercase">Import Reference Posts</Label>
            <Button onClick={handleImportPosts} disabled={importPosts.isPending} className="rounded-none border-2 border-foreground w-full brutal-shadow">
              {importPosts.isPending ? "Importing…" : "Import posts as past blocks"}
            </Button>
            {importMsg && <p className="text-xs font-mono text-muted-foreground">{importMsg}</p>}
          </div>
          <div className="space-y-2 border-2 border-foreground p-4 bg-primary/5">
            <Label className="font-bold uppercase">Mining Start Height</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                min={0}
                placeholder={`current: ${settings?.miningStartHeight ?? 0}`}
                className="border-2 border-foreground rounded-none shadow-none font-mono h-9 flex-1"
                value={startHeight}
                onChange={(e) => setStartHeight(e.target.value)}
              />
              <Button onClick={handleSetStartHeight} disabled={updateSettings.isPending || !startHeight} className="rounded-none border-2 border-foreground h-9 text-xs brutal-shadow">
                Set
              </Button>
            </div>
            <p className="text-xs font-mono text-muted-foreground">Reward mining begins at this block height.</p>
          </div>
        </div>
      </div>

      <div className="border-4 border-foreground bg-card p-6 brutal-shadow space-y-4">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-black uppercase">Email Digest</h2>
            <p className="text-sm font-mono text-muted-foreground">
              {subscribers?.active ?? 0} active subscriber(s) · {subscribers?.total ?? 0} total.
              Idempotent: at most one blast per ISO week.
            </p>
          </div>
          <div className="flex items-center gap-4 border-4 border-foreground bg-muted/30 p-4 brutal-shadow">
            <div>
              <div className="font-black uppercase text-sm">
                Weekly Blast {settings?.blastEnabled ? "On" : "Off"}
              </div>
              <div className="font-mono text-xs text-muted-foreground">Auto-send the weekly digest</div>
            </div>
            <Switch
              checked={settings?.blastEnabled ?? false}
              onCheckedChange={handleToggleBlast}
              disabled={updateSettings.isPending}
            />
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-4 items-start">
          <Button
            onClick={handleRunBlast}
            disabled={runBlast.isPending}
            className="rounded-none border-2 border-foreground brutal-shadow"
            data-testid="button-run-blast"
          >
            {runBlast.isPending ? "Sending…" : "Send This Week's Digest Now"}
          </Button>
          {blastMsg && <p className="text-xs font-mono text-muted-foreground pt-2">{blastMsg}</p>}
        </div>
        {blastRuns && blastRuns.runs.length > 0 && (
          <div className="border-2 border-foreground">
            <div className="grid grid-cols-4 gap-2 bg-muted/50 p-2 font-mono text-xs font-bold uppercase">
              <div>Week</div>
              <div>Status</div>
              <div>Recipients</div>
              <div>Posts</div>
            </div>
            {blastRuns.runs.slice(0, 8).map((r) => (
              <div key={r.id} className="grid grid-cols-4 gap-2 p-2 font-mono text-xs border-t border-foreground/20">
                <div>{r.periodKey}</div>
                <div className={r.status === "failed" ? "text-destructive font-bold" : ""}>{r.status}</div>
                <div>{r.recipientCount}</div>
                <div>{r.postCount}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-4 border-foreground bg-card p-6 brutal-shadow space-y-4">
        <h2 className="text-2xl font-black uppercase">Create New Draft</h2>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label className="font-bold uppercase">Title</Label>
            <Input className="border-2 border-foreground rounded-none shadow-none font-mono" value={newBlock.title} onChange={e => setNewBlock({...newBlock, title: e.target.value})} placeholder="e.g. Genesis Block" />
          </div>
          <div className="space-y-2">
            <Label className="font-bold uppercase">Topic</Label>
            <Input className="border-2 border-foreground rounded-none shadow-none font-mono" value={newBlock.topic} onChange={e => setNewBlock({...newBlock, topic: e.target.value})} placeholder="Prompt for miners..." />
          </div>
          <div className="space-y-2">
            <Label className="font-bold uppercase">Reward (ITC)</Label>
            <Input type="number" className="border-2 border-foreground rounded-none shadow-none font-mono" value={newBlock.rewardItc} onChange={e => setNewBlock({...newBlock, rewardItc: Number(e.target.value)})} />
          </div>
        </div>
        <Button onClick={handleCreate} disabled={create.isPending || !newBlock.title} className="w-full border-2 border-foreground rounded-none brutal-shadow">
          Create Block
        </Button>
      </div>

      <div className="grid gap-6">
        {blocks?.map((b) => (
          <div key={b.id} className="border-4 border-foreground bg-card p-6 brutal-shadow space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <div className="font-mono text-sm font-bold uppercase flex gap-2 mb-1 items-center">
                  <span className="bg-foreground text-background px-2 py-1">#{b.seq}</span>
                  <span className="text-primary border-2 border-primary px-2 py-1">{b.status}</span>
                  {b.xPostedAt && (
                    <span className="border-2 border-foreground px-2 py-1 bg-secondary text-secondary-foreground">posted • {b.postMode}</span>
                  )}
                </div>
                <div className="font-black text-2xl uppercase mt-2">{b.title}</div>
                <div className="text-muted-foreground font-mono mt-1">{b.replyCount} Replies • {b.rewardItc} ITC Pool</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {b.status === "draft" && (
                  <Button variant="outline" onClick={() => handleAdvance(b.seq, "post")} className="rounded-none border-2 border-foreground bg-secondary text-secondary-foreground hover:bg-secondary/80 brutal-shadow">Post/Open Block</Button>
                )}
                {b.status === "open" && (
                  <Button variant="outline" onClick={() => handleAdvance(b.seq, "close")} className="rounded-none border-2 border-destructive text-destructive hover:bg-destructive hover:text-white brutal-shadow">Close Block</Button>
                )}
                {b.status === "closed" && (
                  <Button onClick={() => handleSettle(b.seq)} className="rounded-none border-2 border-foreground brutal-shadow">Run Settlement</Button>
                )}
              </div>
            </div>

            <div className="border-t-4 border-foreground pt-4 mt-4 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="font-black uppercase">AiAS Post Content</h3>
                <Button onClick={() => handleGeneratePost(b.seq)} disabled={generatePost.isPending} variant="outline" className="rounded-none border-2 border-foreground h-8 text-xs brutal-shadow">
                  {b.postContent ? "Re-cook Post" : "Cook Post"}
                </Button>
              </div>
              {b.postContent ? (
                <Textarea readOnly value={b.postContent} className="border-2 border-foreground rounded-none shadow-none font-mono text-sm resize-none h-32 bg-muted/30" />
              ) : (
                <p className="text-sm font-mono text-muted-foreground">No post cooked yet. AiAS will draft an X post for this block.</p>
              )}
              <div className="flex flex-wrap gap-2">
                {b.shareUrl && (
                  <Button asChild className="rounded-none border-2 border-foreground brutal-shadow bg-primary text-primary-foreground">
                    <a href={b.shareUrl} target="_blank" rel="noopener noreferrer">Share on X →</a>
                  </Button>
                )}
                {b.xPostUrl && (
                  <Button asChild variant="outline" className="rounded-none border-2 border-foreground brutal-shadow">
                    <a href={b.xPostUrl} target="_blank" rel="noopener noreferrer">View Live Post ↗</a>
                  </Button>
                )}
              </div>
              <div className="flex flex-col md:flex-row gap-2 items-stretch md:items-center">
                <Input
                  placeholder="Paste published X post URL to attach…"
                  className="border-2 border-foreground rounded-none shadow-none font-mono text-sm h-9 flex-1"
                  value={attachUrl?.seq === b.seq ? attachUrl.url : ""}
                  onChange={e => setAttachUrl({ seq: b.seq, url: e.target.value })}
                />
                <Button onClick={() => handleAttachPost(b.seq)} disabled={attachPost.isPending || attachUrl?.seq !== b.seq || !attachUrl.url} className="rounded-none border-2 border-foreground h-9 text-xs brutal-shadow">
                  Attach URL
                </Button>
              </div>
            </div>

            <div className="border-t-4 border-foreground pt-4 mt-4 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="font-black uppercase">NetRows Sync</h3>
                <Button onClick={() => handleSync(b.seq)} disabled={syncBlock.isPending} variant="outline" className="rounded-none border-2 border-foreground h-8 text-xs brutal-shadow">
                  Sync from NetRows
                </Button>
              </div>
              {syncResult?.seq === b.seq && (
                <p className="text-sm font-mono text-muted-foreground border-2 border-foreground bg-muted/30 p-2">{syncResult.message}</p>
              )}
            </div>

            {b.status === "open" && (
              <div className="border-t-4 border-foreground pt-4 mt-4">
                <div className="space-y-4 border-2 border-foreground p-4 bg-primary/5">
                  <h3 className="font-black uppercase">Manual Injection</h3>
                  <div className="space-y-2">
                    <Input 
                      placeholder="X Handle (e.g. satoshi)" 
                      className="border-2 border-foreground rounded-none shadow-none font-mono text-sm h-8"
                      value={manualReply?.seq === b.seq ? manualReply.handle : ""}
                      onChange={e => setManualReply({ seq: b.seq, handle: e.target.value, replyText: manualReply?.seq === b.seq ? manualReply.replyText : "" })}
                    />
                    <Textarea 
                      placeholder="Reply text..." 
                      className="border-2 border-foreground rounded-none shadow-none font-mono text-sm resize-none h-16"
                      value={manualReply?.seq === b.seq ? manualReply.replyText : ""}
                      onChange={e => setManualReply({ seq: b.seq, handle: manualReply?.seq === b.seq ? manualReply.handle : "", replyText: e.target.value })}
                    />
                    <Button onClick={() => handleSubmitReply(b.seq)} disabled={submitReply.isPending || manualReply?.seq !== b.seq || !manualReply.handle} className="rounded-none border-2 border-foreground w-full h-8 text-xs brutal-shadow">
                      Inject Reply
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
