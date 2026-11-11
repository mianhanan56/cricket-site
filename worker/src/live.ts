// One Durable Object holds every browser's live socket and polls the upstream once per
// topic for all of them, sending each socket only what changed.
//   matches      snapshot, then per-match diffs of /matches/live
//   card:<key>   the whole /match/scorecard body, when it changes
//   feed:<key>   the newest /match/commentary page, when it changes
// Frames carry the hub's `epoch` and a `seq` that only rises; a diff also names
// the `prev` seq it follows, so a client can tell when one went missing.

import { DurableObject } from 'cloudflare:workers';
import {
  admit,
  isIdle,
  MAX_MESSAGE_CHARS,
  MAX_SOCKETS,
  MAX_SOCKETS_PER_ADDRESS,
  MAX_TOPICS,
  parseTopic,
  withinMessageRate,
  type Attachment,
  type Kind,
} from './hubRules';
import { matchRoute, readParams, type RouteDef } from './routes';
import { SHAPES } from './shapes';
import { fetchUpstream } from './upstream';

const PROTOCOL = 1;
// How long the hub trusts its copy of which matches exist before asking again.
const KNOWN_TTL_MS = 60_000;
const KNOWN_RETRY_MS = 5_000;

// A topic polls every 2s while it keeps changing, matching the old client poll,
// and slows once it has been quiet: a Test at stumps should not cost a request
// every two seconds all night.
const FAST_MS = 2_000;
const QUIET_MS = 10_000;
const IDLE_MS = 30_000;
const MAX_RETRY_MS = 60_000;

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

function newTopic(kind: Kind, key: string): TopicState {
  return { kind, key, seq: 0, body: null, hash: null, fetchedAt: 0, due: 0, unchanged: 0, failures: 0 };
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
  /** Match ids in the current list: the only keys a card or feed topic may name. */
  private known = new Set<string>();
  private knownAt = 0;
  private knownRead: Promise<void> | null = null;

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    // Answered by the runtime without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}'));
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected a WebSocket upgrade', { status: 426 });
    }
    const address = `ip:${request.headers.get('CF-Connecting-IP') ?? 'unknown'}`;
    if (this.full(address)) {
      this.dropIdle();
      if (this.full(address)) return new Response('Too many connections', { status: 503, headers: { 'Retry-After': '60' } });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [address]);
    server.serializeAttachment({ topics: [], at: Date.now() } satisfies Attachment);
    server.send(JSON.stringify({ type: 'hello', v: PROTOCOL, epoch: this.epoch, ts: Date.now() }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const counted = (ws.deserializeAttachment() as Attachment | null) ?? { topics: [] };
    const size = typeof raw === 'string' ? raw.length : raw.byteLength;
    const allowed = size <= MAX_MESSAGE_CHARS && withinMessageRate(counted, Date.now());
    ws.serializeAttachment(counted);
    if (!allowed) {
      ws.close(1008, 'Too many or too large messages');
      return;
    }

    let msg: { type?: unknown; topics?: unknown };
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    } catch {
      return;
    }
    if (msg.type !== 'subscribe' && msg.type !== 'unsubscribe') return;
    const asked: unknown[] = Array.isArray(msg.topics) ? msg.topics : [];

    if (msg.type === 'subscribe' && asked.some((t) => typeof t === 'string' && t !== 'matches')) await this.readKnown();

    // Read again: another message on this socket may have been handled during the await.
    const attachment = (ws.deserializeAttachment() as Attachment | null) ?? { topics: [] };
    const current = new Set(attachment.topics);
    if (msg.type === 'unsubscribe') {
      for (const t of asked) if (typeof t === 'string') current.delete(t);
      ws.serializeAttachment({ ...attachment, topics: [...current] } satisfies Attachment);
      return;
    }

    const added = admit(asked, current, this.topics, (key) => this.known.has(key));
    for (const t of added) current.add(t);
    ws.serializeAttachment({ ...attachment, topics: [...current] } satisfies Attachment);

    let fetchNow = false;
    for (const topic of added) {
      const state = this.topics.get(topic);
      if (state && state.body !== null) {
        this.send(ws, this.snapshotOf(topic, state));
      } else if (!state) {
        const { kind, key } = parseTopic(topic)!;
        this.topics.set(topic, newTopic(kind, key));
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
      if (this.topics.has(topic)) continue;
      // Attachments outlive deploys; one written by an older topic format is skipped, not fatal.
      const parsed = parseTopic(topic);
      if (parsed && this.topics.size < MAX_TOPICS) this.topics.set(topic, newTopic(parsed.kind, parsed.key));
    }

    const due = [...this.topics.entries()].filter(([, s]) => s.due <= now);
    await Promise.all(due.map(([topic, state]) => this.refresh(topic, state)));

    const next = Math.min(...[...this.topics.values()].map((s) => s.due));
    await this.ctx.storage.setAlarm(Math.max(next, Date.now() + 1_000));
  }

  private full(address: string): boolean {
    return (
      this.ctx.getWebSockets().length >= MAX_SOCKETS || this.ctx.getWebSockets(address).length >= MAX_SOCKETS_PER_ADDRESS
    );
  }

  /** Closes the sockets that never subscribed, so a pile of them can't hold every slot. */
  private dropIdle(): void {
    const now = Date.now();
    for (const ws of this.ctx.getWebSockets()) {
      if (!isIdle(ws.deserializeAttachment() as Attachment | null, now)) continue;
      try {
        ws.close(1008, 'Idle');
      } catch {
        // Already closed.
      }
    }
  }

  /** Refreshes `known` when it has aged out. The `matches` topic keeps it fresh for free while it runs. */
  private readKnown(): Promise<void> {
    if (Date.now() - this.knownAt < KNOWN_TTL_MS) return Promise.resolve();
    this.knownRead ??= (async () => {
      try {
        const { route, search } = upstreamFor('matches', '');
        const res = await fetchUpstream(route, readParams(route, search));
        if (!res.ok) throw new Error(`upstream ${res.status}`);
        const raw: unknown = await res.json();
        this.setKnown(SHAPES[route.match]?.(raw) ?? raw);
      } catch {
        // Keep the last list and look again shortly; meanwhile unknown keys are refused.
        this.knownAt = Date.now() - KNOWN_TTL_MS + KNOWN_RETRY_MS;
      } finally {
        this.knownRead = null;
      }
    })();
    return this.knownRead;
  }

  private setKnown(body: unknown): void {
    if (!body || typeof body !== 'object') return;
    this.known = new Set(Object.keys(body));
    this.knownAt = Date.now();
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
      const raw: unknown = await res.json();
      body = SHAPES[route.match]?.(raw) ?? raw;
    } catch (err) {
      // Subscribers keep what they have; their own HTTP poll is the fallback.
      if (!state.failures) console.warn('live: topic refresh failing', { topic, error: String(err) });
      state.failures += 1;
      state.due = Date.now() + cadence(state);
      return;
    }

    if (state.failures) console.info('live: topic recovered', { topic, after: state.failures });
    state.failures = 0;
    state.fetchedAt = Date.now();
    const first = state.body === null;

    if (state.kind === 'matches') {
      this.setKnown(body);
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
