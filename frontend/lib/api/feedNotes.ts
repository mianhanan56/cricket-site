// The upstream's markup as plain text or text runs, and the non-delivery rows of the
// ball feed (notes, stat cards, reviews, milestones) as `FeedNote`s.
import type { FeedNote, RichParagraph, RichRun } from '@/types';
import type { ApiBallFeed } from './commentary';
import { cleanKey } from './names';

/** The upstream writes bold tags and entities into its commentary; the UI renders text. */
export function plainText(raw: string | undefined): string {
  return (raw ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, e: string) => {
    if (e[0] !== '#') return ENTITIES[e.toLowerCase()] ?? whole;
    const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
  });
}

/**
 * The upstream's commentary markup as text runs. It writes only `<b>`, `<u>` and line breaks (a blank
 * line between paragraphs); every other tag is dropped, so nothing it sends is rendered as HTML.
 */
export function richText(raw: string | undefined): RichParagraph[] {
  const paragraphs: RichParagraph[] = [];
  let lines: RichRun[][] = [];
  let line: RichRun[] = [];
  let bold = 0;
  let under = 0;

  const endLine = () => {
    const runs = line.map((r) => ({ ...r }));
    if (runs.length) {
      runs[0].text = runs[0].text.trimStart();
      runs[runs.length - 1].text = runs[runs.length - 1].text.trimEnd();
    }
    const kept = runs.filter((r) => r.text);
    if (kept.length) lines.push(kept);
    else if (lines.length) {
      paragraphs.push(lines);
      lines = [];
    }
    line = [];
  };

  for (const token of (raw ?? '').split(/(<[^>]*>)/)) {
    if (!token) continue;
    const tag = /^<\s*(\/?)\s*([a-z0-9]+)/i.exec(token);
    if (tag) {
      const step = tag[1] ? -1 : 1;
      const name = tag[2].toLowerCase();
      if (name === 'br' || name === 'div' || name === 'p') endLine();
      else if (name === 'b' || name === 'strong') bold = Math.max(0, bold + step);
      else if (name === 'u') under = Math.max(0, under + step);
      continue;
    }
    const text = decodeEntities(token).replace(/\s+/g, ' ');
    if (!text) continue;
    const run: RichRun = { text, ...(bold ? { strong: true } : null), ...(under ? { title: true } : null) };
    const prev = line[line.length - 1];
    if (prev && Boolean(prev.strong) === Boolean(run.strong) && Boolean(prev.title) === Boolean(run.title)) prev.text += text;
    else line.push(run);
  }
  endLine();
  if (lines.length) paragraphs.push(lines);
  return paragraphs;
}

// Stat cards send numbers as strings too, or "" for none.
const looseNum = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const looseStr = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null;
const reviewsLeft = (v: unknown): Record<string, number> =>
  v && typeof v === 'object'
    ? Object.fromEntries(
        Object.entries(v as Record<string, unknown>).flatMap(([k, n]) => (typeof n === 'number' ? [[k, n]] : []))
      )
    : {};

/** One non-delivery row as the commentary shows it; polls and rows it has no card for are null. */
export function toFeedNote(f: ApiBallFeed): FeedNote | null {
  if (typeof f.id !== 'number') return null;
  const base = { id: String(f.id), inning: f.inning ?? 0, at: f.id };
  const key = (v: unknown) => cleanKey(looseStr(v) ?? undefined) || null;

  switch (f.type) {
    case 't': {
      const paragraphs = richText(f.text);
      return paragraphs.length ? { ...base, kind: 'text', paragraphs, featured: f.subType === 'f' } : null;
    }
    case 'ps': {
      const playerId = key(f.playerKey);
      const name = looseStr(f.name);
      if (!playerId || !name) return null;
      const batter = looseStr(f.discipline) === '1';
      const rank = looseNum(f.rank);
      return {
        ...base,
        kind: 'player',
        role: batter ? 'batter' : 'bowler',
        playerId,
        name,
        age: looseNum(f.age),
        rank: rank && rank > 0 ? rank : null,
        position: batter ? looseNum(f.battingPosition) : null,
        career: {
          innings: looseNum(f.innings) ?? 0,
          total: looseNum(f.total) ?? 0,
          average: looseNum(f.average),
          rate: looseNum(f.rate),
        },
      };
    }
    case 'pbc': {
      const batterId = key(f.batterKey);
      const bowlerId = key(f.bowlerKey);
      const balls = looseNum(f.balls) ?? 0;
      if (!batterId || !bowlerId || !balls) return null;
      return {
        ...base,
        kind: 'battle',
        batterId,
        bowlerId,
        format: looseStr(f.format),
        since: looseNum(f.since),
        innings: looseNum(f.innings) ?? 0,
        runs: looseNum(f.runs) ?? 0,
        balls,
        outs: looseNum(f.dismissals) ?? 0,
        strikeRate: looseNum(f.strikeRate),
      };
    }
    case 'pvtc': {
      const playerId = key(f.playerKey);
      const opponentId = key(f.opponentKey);
      if (!playerId || !opponentId) return null;
      return {
        ...base,
        kind: 'versus',
        playerId,
        opponentId,
        format: looseStr(f.format),
        innings: looseNum(f.innings) ?? 0,
        runs: looseNum(f.runs) ?? 0,
        average: looseNum(f.average),
        strikeRate: looseNum(f.strikeRate),
      };
    }
    case 'ac': {
      const text = plainText(f.text);
      return text ? { ...base, kind: 'review', text, reviewsLeft: reviewsLeft(f.reviewsLeft) } : null;
    }
    case 'rc': {
      const edge = looseStr(f.ultraEdge);
      return {
        ...base,
        kind: 'decision',
        by: looseNum(f.reviewedBy) === 1 ? 'fielding' : 'batting',
        out: looseStr(f.result) === '1',
        ultraEdge: edge === '1' ? true : edge === '0' ? false : null,
        battingId: key(f.battingTeamKey),
        fieldingId: key(f.bowlingTeamKey),
        reviewsLeft: reviewsLeft(f.reviewsLeft),
      };
    }
    case 'pm':
    case 'tm': {
      const name = looseStr(f.name);
      const score = looseNum(f.runs);
      if (!name || !score) return null;
      return {
        ...base,
        kind: 'milestone',
        name,
        playerId: f.type === 'pm' ? key(f.playerKey) : null,
        score,
        balls: f.type === 'pm' ? looseNum(f.balls) : null,
        text: plainText(f.text),
      };
    }
    case 'tc': {
      const text = plainText(f.text);
      return text ? { ...base, kind: 'target', text, rrr: looseStr(f.requiredRunRate) } : null;
    }
    case 'w': {
      const name = looseStr(f.name);
      if (!name) return null;
      return {
        ...base,
        kind: 'wicket',
        playerId: key(f.playerKey),
        name,
        how: looseStr(f.howOut) ?? '',
        runs: looseNum(f.runs) ?? 0,
        balls: looseNum(f.balls) ?? 0,
        fours: looseNum(f.fours) ?? 0,
        sixes: looseNum(f.sixes) ?? 0,
        strikeRate: looseStr(f.strikeRate),
      };
    }
    case 'to': {
      const text = plainText(f.text);
      return text ? { ...base, kind: 'toss', text } : null;
    }
    case 'ic2': {
      const teamName = looseStr(f.name);
      const score = looseStr(f.score);
      return teamName && score ? { ...base, kind: 'inningsEnd', teamName, score, overs: looseStr(f.overs) } : null;
    }
    default:
      return null;
  }
}
