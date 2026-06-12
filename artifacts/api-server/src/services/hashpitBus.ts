import { EventEmitter } from "node:events";

/**
 * Hashpit event bus — in-process pub/sub for chat messages and system events.
 *
 * Channels:
 *   "block:<blockId>"  → per-block Hashpit
 *   "lobby"            → global landing page trollbox
 *
 * Each SSE client subscribes to a channel. When a message is emitted,
 * all subscribers on that channel receive it instantly.
 */

export interface ChatMsg {
  id: string;
  channel: string;
  handle: string;
  body: string;
  kind: "chat" | "system";
  miningKeyHash: string | null;
  createdAt: string;
}

type Listener = (msg: ChatMsg) => void;

class HashpitBus {
  private emitter = new EventEmitter();
  /** Track SSE client count per channel */
  private clients = new Map<string, number>();

  constructor() {
    // Allow many SSE listeners per channel
    this.emitter.setMaxListeners(500);
  }

  /** Emit a message to all subscribers on a channel */
  emit(channel: string, msg: ChatMsg): void {
    this.emitter.emit(channel, msg);
  }

  /** Subscribe to a channel. Returns an unsubscribe function. */
  subscribe(channel: string, listener: Listener): () => void {
    this.emitter.on(channel, listener);
    this.clients.set(channel, (this.clients.get(channel) ?? 0) + 1);

    return () => {
      this.emitter.off(channel, listener);
      const count = (this.clients.get(channel) ?? 1) - 1;
      if (count <= 0) {
        this.clients.delete(channel);
      } else {
        this.clients.set(channel, count);
      }
    };
  }

  /** Get connected client count for a channel */
  getClientCount(channel: string): number {
    return this.clients.get(channel) ?? 0;
  }
}

/** Singleton bus — shared across all routes and services */
export const hashpitBus = new HashpitBus();
