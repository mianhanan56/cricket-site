// One Durable Object holds every browser's live socket and polls crex once per
// topic for all of them, sending each socket only what changed.
//   matches      snapshot, then per-match diffs of /matches/live
//   card:<key>   the whole /match/scorecard body, when it changes
//   feed:<key>   the newest /match/commentary page, when it changes
// Frames carry the hub's `epoch` and a `seq` that only rises; a diff also names
// the `prev` seq it follows, so a client can tell when one went missing.

import { DurableObject } from 'cloudflare:workers';
import { matchRoute, readParams, type RouteDef } from './routes';
import { fetchUpstream } from './upstream';

const PROTOCOL = 1;
const MAX_TOPICS_PER_SOCKET = 30;
const KEY = /^[A-Za-z0-9_-]{1,40}$/;

// A topic polls every 2s while it keeps changing, matching the old client poll,
// and slows once it has been quiet: a Test at stumps should not cost a request
// every two seconds all night.
const FAST_MS = 2_000;
const QUIET_MS = 10_000;
const IDLE_MS = 30_000;
const MAX_RETRY_MS = 60_000;

type Kind = 'matches' | 'card' | 'feed';

interface TopicState {
  kind: Kind;
  key: string;
  seq: number;
  /** Last body as parsed JSON — the snapshot handed to a new subscriber. */
  body: unknown;
  /** matches: each match's JSON by id. card/feed: the body's JSON. */
  hash: Map<string, string> | string | null;
  fetchedAt: number;
  due: number;
  unchanged: number;
  failures: number;
}

interface Attachment {
  topics: string[];
}

function parseTopic(topic: unknown): { kind: Kind; key: string } | null {
  if (topic === 'matches') return { kind: 'matches', key: '' };
  if (typeof topic !== 'string') return null;
  const [kind, key] = topic.split(':');
  if ((kind === 'card' || kind === 'feed') && key && KEY.test(key)) return { kind, key };
  return null;
}

function upstreamFor(kind: Kind, key: string): { route: RouteDef; search: URLSearchParams } {
  const path = kind === 'matches' ? '/matches/live' : kind === 'card' ? '/match/scorecard' : '/match/commentary';
  const route = matchRoute(path);
  if (!route) throw new Error(`No route ${path}`);
  const search = new URLSearchParams(kind === 'card' ? { key } : kind === 'feed' ? { matchKey: key } : {});
  return { route, search };
}

function cadence(state: TopicState): number {
  if (state.failures) return Math.min(FAST_MS * 2 ** state.failures, MAX_RETRY_MS);
  if (state.unchanged < 15) return FAST_MS;
  return state.unchanged < 60 ? QUIET_MS : IDLE_MS;
}

export class LiveHub extends DurableObject<unknown> {
  private readonly epoch = crypto.randomUUID();
  private readonly topics = new Map<string, TopicState>();
  private seq = 0;

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    // Answered by the runtime without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}'));
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected a WebSocket upgrade', { status: 426 });
    }
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ topics: [] } satisfies Attachment);
    server.send(JSON.stringify({ type: 'hello', v: PROTOCOL, epoch: this.epoch, ts: Date.now() }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    let msg: { type?: unknown; topics?: unknown };
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    } catch {
      return;
    }
    if (msg.type !== 'subscribe' && msg.type !== 'unsubscribe') return;
    const asked = Array.isArray(msg.topics) ? msg.topics : [];
    const valid = asked.filter((t): t is string => parseTopic(t) !== null);

    const current = new Set((ws.deserializeAttachment() as Attachment | null)?.topics ?? []);
    if (msg.type === 'unsubscribe') {
      for (const t of valid) current.delete(t);
      ws.serializeAttachment({ topics: [...current] } satisfies Attachment);
      return;
    }

    const added: string[] = [];
    for (const t of valid) {
      if (current.size >= MAX_TOPICS_PER_SOCKET) break;
      if (!current.has(t)) added.push(t);
      current.add(t);
    }
    ws.serializeAttachment({ topics: [...current] } satisfies Attachment);

    let fetchNow = false;
    for (const topic of added) {
      const state = this.topics.get(topic);
      if (state && state.body !== null) {
        this.send(ws, this.snapshotOf(topic, state));
      } else if (!state) {
        const { kind, key } = parseTopic(topic)!;
        this.topics.set(topic, {
          kind,
          key,
          seq: 0,
          body: null,
          hash: null,
          fetchedAt: 0,
          due: 0,
          unchanged: 0,
          failures: 0,
        });
        fetchNow = true;
      }
    }
    if (fetchNow) await this.armAlarm(Date.now());
    else await this.armAlarm(Date.now() + FAST_MS);
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code === 1005 ? 1000 : code, 'bye');
    } catch {
      // Already closed.
    }
  }

  async alarm(): Promise<void> {
    const wanted = new Set<string>();
    for (const ws of this.ctx.getWebSockets()) {
      for (const t of (ws.deserializeAttachment() as Attachment | null)?.topics ?? []) wanted.add(t);
    }
    for (const topic of this.topics.keys()) if (!wanted.has(topic)) this.topics.delete(topic);
    if (!wanted.size) {
      await this.ctx.storage.deleteAlarm();
      return;
    }

    const now = Date.now();
    for (const topic of wanted) {
      if (!this.topics.has(topic)) {
        const { kind, key } = parseTopic(topic)!;
        this.topics.set(topic, { kind, key, seq: 0, body: null, hash: null, fetchedAt: 0, due: 0, unchanged: 0, failures: 0 });
      }
    }

    const due = [...this.topics.entries()].filter(([, s]) => s.due <= now);
    await Promise.all(due.map(([topic, state]) => this.refresh(topic, state)));

    const next = Math.min(...[...this.topics.values()].map((s) => s.due));
    await this.ctx.storage.setAlarm(Math.max(next, Date.now() + 1_000));
  }

  private async armAlarm(at: number): Promise<void> {
    const current = await this.ctx.storage.getAlarm();
    // An overdue one can be left over from an instance that died before it ran.
    if (current === null || current > at || current < Date.now() - 1_000) await this.ctx.storage.setAlarm(at);
  }

  private async refresh(topic: string, state: TopicState): Promise<void> {
    const { route, search } = upstreamFor(state.kind, state.key);
    let body: unknown;
    try {
      const res = await fetchUpstream(route, readParams(route, search));
      if (!res.ok) throw new Error(`upstream ${res.status}`);
      body = await res.json();
    } catch {
      // Subscribers keep what they have; their own HTTP poll is the fallback.
      state.failures += 1;
      state.due = Date.now() + cadence(state);
      return;
    }

    state.failures = 0;
    state.fetchedAt = Date.now();
    const first = state.body === null;

    if (state.kind === 'matches') {
      const entries = body && typeof body === 'object' ? Object.entries(body as Record<string, unknown>) : [];
      const next = new Map(entries.map(([id, m]) => [id, JSON.stringify(m)]));
      const prev = state.hash instanceof Map ? state.hash : new Map<string, string>();
      const changed: Record<string, unknown> = {};
      for (const [id, m] of entries) if (prev.get(id) !== next.get(id)) changed[id] = m;
      const removed = [...prev.keys()].filter((id) => !next.has(id));

      state.body = body;
      state.hash = next;
      if (first) {
        state.seq = ++this.seq;
        this.broadcast(topic, this.snapshotOf(topic, state));
      } else if (Object.keys(changed).length || removed.length) {
        const prevSeq = state.seq;
        state.seq = ++this.seq;
        this.broadcast(topic, {
          type: 'matches:update',
          topic,
          epoch: this.epoch,
          seq: state.seq,
          prev: prevSeq,
          ts: state.fetchedAt,
          changed,
          removed,
        });
      }
      state.unchanged = first || Object.keys(changed).length || removed.length ? 0 : state.unchanged + 1;
    } else {
      const hash = JSON.stringify(body);
      const same = hash === state.hash;
      state.body = body;
      state.hash = hash;
      if (!same) {
        state.seq = ++this.seq;
        this.broadcast(topic, this.snapshotOf(topic, state));
      }
      state.unchanged = same ? state.unchanged + 1 : 0;
    }

    state.due = Date.now() + cadence(state);
  }

  private snapshotOf(topic: string, state: TopicState): Record<string, unknown> {
    const base = { topic, epoch: this.epoch, seq: state.seq, ts: state.fetchedAt };
    if (state.kind === 'matches') return { type: 'matches:snapshot', ...base, data: state.body };
    return { type: `${state.kind}:update`, ...base, matchId: state.key, data: state.body };
  }

  private broadcast(topic: string, message: Record<string, unknown>): void {
    const text = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      const topics = (ws.deserializeAttachment() as Attachment | null)?.topics ?? [];
      if (topics.includes(topic)) this.send(ws, text);
    }
  }

  private send(ws: WebSocket, message: string | Record<string, unknown>): void {
    try {
      ws.send(typeof message === 'string' ? message : JSON.stringify(message));
    } catch {
      // The socket closed between the lookup and the send.
    }
  }
}
