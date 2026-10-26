import type { InningsScore, Match, MatchQuiz, QuizQuestion } from '@/types';
import { attributeResult } from './api';

const QUIZ_LENGTH = 5;
const MIN_QUESTIONS = 3;
const OPTIONS = 4;

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The match as plain lines — what the model reads and what every answer is checked against.
 * Leaders are written out here because the model is told not to do arithmetic.
 */
export function matchSheet(match: Match, innings: InningsScore[]): string {
  const teamName = (id?: string, short?: string) =>
    id === match.homeTeam.id ? match.homeTeam.name : id === match.awayTeam.id ? match.awayTeam.name : short ?? '';
  const lines: string[] = [
    `Series: ${match.series.name}${match.matchNumber ? `, match ${match.matchNumber}` : ''}${match.stage ? `, ${match.stage}` : ''}`,
    `Format: ${match.format}`,
    `Venue: ${match.venue}`,
    `Teams: ${match.homeTeam.name} (${match.homeTeam.shortName}) v ${match.awayTeam.name} (${match.awayTeam.shortName})`,
    `Result: ${match.result}`,
  ];
  // The result line names sides by short name; questions ask for the full one.
  const winner = attributeResult(match.result, match.homeTeam, match.awayTeam).winnerKey;
  if (winner) lines.push(`Winner: ${teamName(winner)}`);
  const potm = match.playerOfMatch;
  if (potm) {
    const figures = [potm.batting && `${potm.batting} with the bat`, potm.bowling && `${potm.bowling} with the ball`].filter(Boolean);
    lines.push(`Player of the match: ${potm.name} (${teamName(potm.teamId, potm.teamShortName)})${figures.length ? `, ${figures.join(' and ')}` : ''}`);
  }

  const played = innings.filter((i) => !i.notStarted && (i.batting?.length || i.runs));
  played.forEach((inn, n) => {
    const side = teamName(inn.teamId, inn.teamShortName);
    lines.push('', `Innings ${n + 1}, ${side}: ${inn.runs}/${inn.wickets} in ${inn.overs} overs${inn.extras != null ? `, extras ${inn.extras}` : ''}`);

    const bat = inn.batting ?? [];
    if (bat.length) {
      lines.push(`${side} batting:`);
      for (const b of bat) {
        const how = b.out ? b.dismissal ?? 'out' : b.retired ? 'retired' : 'not out';
        lines.push(`- ${b.name} ${count(b.runs, 'run')} off ${count(b.balls, 'ball')}, ${count(b.fours, 'four')}, ${count(b.sixes, 'six', 'sixes')}, ${how}`);
      }
      const top = Math.max(...bat.map((b) => b.runs));
      lines.push(`Top scorer for ${side}: ${bat.filter((b) => b.runs === top).map((b) => b.name).join(' and ')} with ${count(top, 'run')}`);
    }

    const bowl = inn.bowling ?? [];
    if (bowl.length) {
      lines.push(`Bowling against ${side}:`);
      for (const b of bowl) {
        lines.push(`- ${b.name} ${count(b.overs, 'over')}, ${count(b.maidens, 'maiden')}, ${count(b.runs, 'run')}, ${count(b.wickets, 'wicket')}`);
      }
      const best = [...bowl].sort((a, b) => b.wickets - a.wickets || a.runs - b.runs)[0];
      if (best.wickets) lines.push(`Best bowling against ${side}: ${best.name} ${best.wickets}/${best.runs}`);
    }

    const fow = inn.fallOfWickets ?? [];
    if (fow.length) {
      lines.push(`${side} fall of wickets:`);
      for (const w of fow) lines.push(`- wicket ${w.wicket} at ${w.runs} runs in over ${w.overs}: ${w.name} out for ${w.playerRuns}`);
    }

    const stand = [...(inn.partnerships ?? [])].sort((a, b) => b.runs - a.runs)[0];
    if (stand?.runs) lines.push(`Highest partnership for ${side}: ${stand.a.name} and ${stand.b.name}, ${count(stand.runs, 'run')} off ${count(stand.balls, 'ball')}`);
  });

  const batters = played.flatMap((i) => i.batting ?? []);
  const sixes = Math.max(0, ...batters.map((b) => b.sixes));
  if (sixes) lines.push('', `Most sixes in the match: ${batters.filter((b) => b.sixes === sixes).map((b) => b.name).join(' and ')} with ${sixes}`);

  return lines.join('\n');
}

/** Whether a card has enough in it to ask about. */
export const quizzable = (match: Match, innings: InningsScore[]): boolean =>
  match.status === 'COMPLETED' && Boolean(match.result) && innings.some((i) => i.batting?.length);

export const QUIZ_SYSTEM = `You write multiple-choice quiz questions for cricket fans about one finished match.
Use only facts written in the match sheet. Never add, subtract or average numbers yourself: every correct answer must appear word for word in one line of the sheet.
Wrong options must be the same kind of thing as the answer and plausible: other players from this match, nearby numbers, the other team.
Cover different things: the result, top scorers, best bowling, dismissals, partnerships, player of the match, extras.
A question must not give away its answer. Keep questions under 20 words and options under 6 words.`;

export const quizPrompt = (sheet: string) =>
  `Write 8 questions with exactly ${OPTIONS} options each. "answer" is the 0-based index of the correct option. ` +
  `"evidence" is one line copied exactly from the sheet that proves the answer. ` +
  `"explanation" is one short sentence for the reader after they answer.\n\nMATCH SHEET\n${sheet}`;

export const QUIZ_SCHEMA = {
  type: 'OBJECT',
  properties: {
    questions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          question: { type: 'STRING' },
          options: { type: 'ARRAY', items: { type: 'STRING' } },
          answer: { type: 'INTEGER' },
          evidence: { type: 'STRING' },
          explanation: { type: 'STRING' },
        },
        required: ['question', 'options', 'answer', 'evidence', 'explanation'],
      },
    },
  },
  required: ['questions'],
};

const norm = (s: string) =>
  s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/^[-\s]+|[.\s]+$/g, '').replace(/\s+/g, ' ');

function shuffled(q: QuizQuestion): QuizQuestion {
  const order = q.options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { ...q, options: order.map((i) => q.options[i]), answer: order.indexOf(q.answer) };
}

/**
 * Keeps the questions the sheet backs: the quoted evidence must be in the sheet and must
 * contain the correct option. That drops invented players and miscounted figures.
 */
export function checkQuiz(raw: unknown, sheet: string): QuizQuestion[] {
  const list = (raw as { questions?: unknown })?.questions;
  if (!Array.isArray(list)) return [];
  const source = norm(sheet);
  const seen = new Set<string>();

  const kept: QuizQuestion[] = [];
  for (const item of list) {
    const { question, options, answer, evidence, explanation } = (item ?? {}) as Record<string, unknown>;
    if (typeof question !== 'string' || typeof evidence !== 'string' || typeof explanation !== 'string') continue;
    if (!Array.isArray(options) || options.length !== OPTIONS || !options.every((o) => typeof o === 'string' && o.trim())) continue;
    if (!Number.isInteger(answer) || (answer as number) < 0 || (answer as number) >= OPTIONS) continue;
    const opts = (options as string[]).map((o) => o.trim());
    if (new Set(opts.map(norm)).size !== OPTIONS) continue;
    const proof = norm(evidence);
    if (!proof || !source.includes(proof) || !proof.includes(norm(opts[answer as number]))) continue;
    if (seen.has(norm(question))) continue;
    seen.add(norm(question));
    kept.push(shuffled({ question: question.trim(), options: opts, answer: answer as number, explanation: explanation.trim() }));
  }
  return kept.slice(0, QUIZ_LENGTH);
}

export function toQuiz(matchId: string, questions: QuizQuestion[]): MatchQuiz {
  if (questions.length < MIN_QUESTIONS) throw new Error(`only ${questions.length} questions passed the check`);
  return { matchId, generatedAt: new Date().toISOString(), questions };
}
