// What the live hub lets a socket do. Pure, so the rules are tested without a Durable Object.

import { KEY } from './routes';

export const MAX_SOCKETS = 10_000;
// One address can be a whole mobile network behind carrier NAT, so this is loose.
export const MAX_SOCKETS_PER_ADDRESS = 100;
export const MAX_TOPICS_PER_SOCKET = 30;
// Every topic is an upstream poll; the live window is a few dozen matches, two topics each.
export const MAX_TOPICS = 400;
export const MAX_MESSAGE_CHARS = 4_096;
export const MESSAGE_WINDOW_MS = 10_000;
export const MAX_MESSAGES_PER_WINDOW = 40;
/** A socket that subscribed to nothing for this long gives up its slot when the hub is full. */
export const IDLE_SOCKET_MS = 60_000;

const MAX_TOPICS_PER_MESSAGE = 100;

export type Kind = 'matches' | 'card' | 'feed';

export interface Attachment {
  topics: string[];
  /** When the socket connected. Absent on one accepted before this field existed. */
  at?: number;
  /** Start of the current message window, and the messages counted in it. */
  window?: number;
  messages?: number;
}

export function parseTopic(topic: unknown): { kind: Kind; key: string } | null {
  if (topic === 'matches') return { kind: 'matches', key: '' };
  if (typeof topic !== 'string') return null;
  const [kind, key, extra] = topic.split(':');
  if ((kind === 'card' || kind === 'feed') && key && extra === undefined && KEY.test(key)) return { kind, key };
  return null;
}

/**
 * The topics in `asked` a socket may add: well-formed, about a match in the current list
 * (anything else would be a poll of the upstream for a key nobody is playing), and within
 * the socket's and the hub's ceilings.
 */
export function admit(
  asked: readonly unknown[],
  held: ReadonlySet<string>,
  hub: { has(topic: string): boolean; size: number },
  isKnown: (key: string) => boolean
): string[] {
  const added: string[] = [];
  let hubSize = hub.size;

  for (const topic of asked.slice(0, MAX_TOPICS_PER_MESSAGE)) {
    if (held.size + added.length >= MAX_TOPICS_PER_SOCKET) break;
    const parsed = parseTopic(topic);
    if (!parsed) continue;
    const name = topic as string;
    if (held.has(name) || added.includes(name)) continue;
    if (parsed.kind !== 'matches' && !isKnown(parsed.key)) continue;
    if (!hub.has(name)) {
      if (hubSize >= MAX_TOPICS) continue;
      hubSize += 1;
    }
    added.push(name);
  }
  return added;
}

/** Counts a message against the socket's window; false once it is over the rate. */
export function withinMessageRate(attachment: Attachment, now: number): boolean {
  if (now - (attachment.window ?? 0) >= MESSAGE_WINDOW_MS) {
    attachment.window = now;
    attachment.messages = 0;
  }
  attachment.messages = (attachment.messages ?? 0) + 1;
  return attachment.messages <= MAX_MESSAGES_PER_WINDOW;
}

export const isIdle = (attachment: Attachment | null, now: number): boolean =>
  !attachment?.topics?.length && now - (attachment?.at ?? 0) >= IDLE_SOCKET_MS;
