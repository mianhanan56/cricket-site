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

// Stat cards carry fields the delivery rows don't, numbers sometimes sent as strings.
type LooseRow = Record<string, unknown>;
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
  const r = f as unknown as LooseRow;
  const base = { id: String(f.id), inning: f.inning ?? 0, at: f.id };
  const key = (v: unknown) => cleanKey(looseStr(v) ?? undefined) || null;

  switch (f.type) {
    case 't': {
      const paragraphs = richText(f.c);
      return paragraphs.length ? { ...base, kind: 'text', paragraphs, featured: r.sub_type === 'f' } : null;
    }
    case 'ps': {
      const playerId = key(r.pf);
      const name = looseStr(r.n);
      if (!playerId || !name) return null;
      const batter = looseStr(r.cat) === '1';
      const rank = looseNum(r.r);
      return {
        ...base,
        kind: 'player',
        role: batter ? 'batter' : 'bowler',
        playerId,
        name,
        teamId: key(r.tf),
        age: looseNum(r.age),
        rank: rank && rank > 0 ? rank : null,
        position: batter ? looseNum(r.bp) : null,
        // `match` is innings, `runs` the bowler's wickets and `sr` his economy.
        career: {
          innings: looseNum(r.match) ?? 0,
          total: looseNum(r.runs) ?? 0,
          average: looseNum(r.avg),
          rate: looseNum(r.sr),
          best: looseStr(r.c),
        },
      };
    }
    case 'pbc': {
      const batterId = key(r.batsman_fkey);
      const bowlerId = key(r.bowler_fkey);
      const balls = looseNum(r.ball_faced) ?? 0;
      if (!batterId || !bowlerId || !balls) return null;
      return {
        ...base,
        kind: 'battle',
        batterId,
        bowlerId,
        format: looseStr(r.fd),
        since: looseNum(r.since),
        innings: looseNum(r.innings) ?? 0,
        runs: looseNum(r.runs) ?? 0,
        balls,
        outs: looseNum(r.out_count) ?? 0,
        strikeRate: looseNum(r.strike_rate),
      };
    }
    case 'pvtc': {
      const playerId = key(r.player_fkey);
      const opponentId = key(r.oppn_team_fkey);
      if (!playerId || !opponentId) return null;
      return {
        ...base,
        kind: 'versus',
        playerId,
        opponentId,
        format: looseStr(r.fd),
        innings: looseNum(r.innings) ?? 0,
        runs: looseNum(r.runs) ?? 0,
        balls: looseNum(r.balls) ?? 0,
        average: looseNum(r.batting_average),
        strikeRate: looseNum(r.strike_rate),
      };
    }
    case 'ac': {
      const text = plainText(f.c);
      return text ? { ...base, kind: 'review', text, reviewsLeft: reviewsLeft(r.review_left) } : null;
    }
    case 'rc': {
      const edge = looseStr(r.ultraedge);
      return {
        ...base,
        kind: 'decision',
        // `review_type` 0 is the batter's review, 1 the fielding side's; `result` 1 is out.
        by: looseNum(r.review_type) === 1 ? 'fielding' : 'batting',
        out: looseStr(r.result) === '1',
        ultraEdge: edge === '1' ? true : edge === '0' ? false : null,
        battingId: key(r.tbf),
        fieldingId: key(r.tbwf),
        reviewsLeft: reviewsLeft(r.review_left),
      };
    }
    case 'pm':
    case 'tm': {
      const name = looseStr(r.n);
      const score = looseNum(r.s);
      if (!name || !score) return null;
      return {
        ...base,
        kind: 'milestone',
        name,
        playerId: f.type === 'pm' ? key(r.pf) : null,
        score,
        balls: f.type === 'pm' ? looseNum(r.b) : null,
        text: plainText(f.c),
      };
    }
    case 'tc': {
      const text = plainText(f.c);
      return text ? { ...base, kind: 'target', text, rrr: looseStr(r.rrr) } : null;
    }
    case 'w': {
      const name = looseStr(r.player_fullname) ?? looseStr(r.n);
      if (!name) return null;
      return {
        ...base,
        kind: 'wicket',
        playerId: key(r.player_fkey),
        name,
        how: looseStr(r.wicketDesc) ?? '',
        runs: looseNum(r.r) ?? 0,
        balls: looseNum(r.b) ?? 0,
        fours: looseNum(r.f) ?? 0,
        sixes: looseNum(r.s) ?? 0,
        strikeRate: looseStr(r.sr),
      };
    }
    case 'to': {
      const text = plainText(f.c);
      return text ? { ...base, kind: 'toss', text } : null;
    }
    case 'ic2': {
      const teamName = looseStr(r.n);
      const score = looseStr(r.score);
      return teamName && score ? { ...base, kind: 'inningsEnd', teamName, score, overs: looseStr(r.o) } : null;
    }
    default:
      return null;
  }
}
