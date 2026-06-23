import { Server as SocketServer } from 'socket.io';
import type { Server as HttpServer } from 'http';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  ScoreUpdatePayload,
  BallDeliveredPayload,
  WicketFallPayload,
} from '@crex/shared';
import { prisma } from './lib/prisma';

// ---------------------------------------------------------------------------
// Socket.io server (attached to the existing Express HTTP server)
// ---------------------------------------------------------------------------

let io: SocketServer<ClientToServerEvents, ServerToClientEvents> | null = null;

const roomFor = (matchId: string) => `match:${matchId}`;

export function initSocket(httpServer: HttpServer, corsOrigin: string, port: number) {
  io = new SocketServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: corsOrigin, methods: ['GET', 'POST'] },
  });

  io.on('connection', (socket) => {
    // Clients subscribe to a specific match room.
    socket.on('match:subscribe', (matchId) => {
      socket.join(roomFor(matchId));
      console.log(`[socket] ${socket.id} joined ${roomFor(matchId)}`);
    });
    socket.on('match:unsubscribe', (matchId) => {
      socket.leave(roomFor(matchId));
    });
  });

  console.log(`[socket] Socket.io attached on port ${port}`);

  startSimulator();
  return io;
}

function ensureIo() {
  if (!io) throw new Error('Socket.io not initialised — call initSocket first');
  return io;
}

// --- Low-level emit helpers -------------------------------------------------

export function emitScoreUpdate(payload: ScoreUpdatePayload) {
  ensureIo().to(roomFor(payload.matchId)).emit('score:update', payload);
}

export function emitBallDelivered(payload: BallDeliveredPayload) {
  ensureIo().to(roomFor(payload.matchId)).emit('ball:delivered', payload);
}

export function emitWicketFall(payload: WicketFallPayload) {
  ensureIo().to(roomFor(payload.matchId)).emit('wicket:fall', payload);
}

/**
 * Read a match's current scorecard from the DB and broadcast a score:update.
 * Wired here so a future CricAPI webhook / poller can push real updates by id.
 */
export async function broadcastScoreUpdate(matchId: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { homeTeam: true },
  });
  if (!match) return;

  const scorecard = (match.scorecard as ScoreUpdatePayload['scorecard'] | null) ?? { innings: [] };
  const inn = scorecard.innings?.[scorecard.currentInnings ?? 0];
  const currentScore = inn ? `${inn.runs}/${inn.wickets} (${inn.overs})` : '0/0 (0.0)';

  emitScoreUpdate({ matchId, scorecard, currentScore });
}

// ---------------------------------------------------------------------------
// Dev simulator — emits a fake ball every 8s on every LIVE match
// ---------------------------------------------------------------------------

interface SimState {
  runs: number;
  wickets: number;
  balls: number; // legal balls bowled this innings
  teamShortName: string;
  teamId: string;
  strikerIdx: number;
}

const BATTERS = ['Rohit Sharma', 'Virat Kohli', 'Shubman Gill', 'Shreyas Iyer', 'KL Rahul', 'Hardik Pandya'];
const BOWLERS = ['Mitchell Starc', 'Pat Cummins', 'Josh Hazlewood', 'Adam Zampa'];

const sim = new Map<string, SimState>();

const oversStr = (balls: number) => `${Math.floor(balls / 6)}.${balls % 6}`;
const oversNum = (balls: number) => Math.floor(balls / 6) + (balls % 6) / 10;

// Deterministic-ish pseudo random based on a rotating counter (Math.random is
// fine in the backend; we just avoid it being too uniform).
function pickOutcome(): { runs: number; isWicket: boolean; label: string } {
  const r = Math.random();
  if (r < 0.08) return { runs: 0, isWicket: true, label: 'WICKET' };
  if (r < 0.45) return { runs: 0, isWicket: false, label: 'dot' };
  if (r < 0.7) return { runs: 1, isWicket: false, label: 'single' };
  if (r < 0.82) return { runs: 2, isWicket: false, label: 'two' };
  if (r < 0.94) return { runs: 4, isWicket: false, label: 'FOUR' };
  return { runs: 6, isWicket: false, label: 'SIX' };
}

function commentaryText(state: SimState, outcome: ReturnType<typeof pickOutcome>) {
  const bowler = BOWLERS[state.balls % BOWLERS.length];
  const batter = BATTERS[state.strikerIdx % BATTERS.length];
  const where = `${bowler} to ${batter}`;
  switch (outcome.label) {
    case 'WICKET':
      return `OUT! ${where}, ${batter} departs — what a breakthrough!`;
    case 'FOUR':
      return `FOUR! ${where}, races away to the boundary.`;
    case 'SIX':
      return `SIX! ${where}, launched over the ropes!`;
    case 'dot':
      return `${where}, no run.`;
    default:
      return `${where}, ${outcome.runs} run${outcome.runs === 1 ? '' : 's'}.`;
  }
}

async function simulateMatch(match: {
  id: string;
  homeTeamId: string;
  homeTeam: { shortName: string };
  scorecard: unknown;
}) {
  // Lazily seed in-memory state from the stored scorecard the first time.
  let state = sim.get(match.id);
  if (!state) {
    const sc = match.scorecard as { innings?: Array<{ runs: number; wickets: number; overs: number }> } | null;
    const inn = sc?.innings?.[0];
    const balls = inn ? Math.round(inn.overs) * 6 + Math.round((inn.overs % 1) * 10) : 0;
    state = {
      runs: inn?.runs ?? 0,
      wickets: inn?.wickets ?? 0,
      balls,
      teamShortName: match.homeTeam.shortName,
      teamId: match.homeTeamId,
      strikerIdx: inn?.wickets ?? 0,
    };
    sim.set(match.id, state);
  }

  const outcome = pickOutcome();
  state.balls += 1;
  state.runs += outcome.runs;
  if (outcome.isWicket) state.wickets += 1;

  const over = Math.floor((state.balls - 1) / 6);
  const ballInOver = ((state.balls - 1) % 6) + 1;
  const text = commentaryText(state, outcome);
  const scoreStr = `${state.runs}/${state.wickets}`;

  // 1) ball:delivered
  emitBallDelivered({
    matchId: match.id,
    over,
    ball: ballInOver,
    runs: outcome.runs,
    isWicket: outcome.isWicket,
    commentary: text,
  });

  // 2) score:update
  const scorecard = {
    innings: [
      {
        teamId: state.teamId,
        teamShortName: state.teamShortName,
        runs: state.runs,
        wickets: state.wickets,
        overs: oversNum(state.balls),
        runRate: state.balls ? +((state.runs / state.balls) * 6).toFixed(2) : 0,
      },
    ],
    currentInnings: 0,
  };
  emitScoreUpdate({
    matchId: match.id,
    scorecard,
    currentScore: `${scoreStr} (${oversStr(state.balls)})`,
  });

  // 3) wicket:fall (only on wickets)
  if (outcome.isWicket) {
    const playerName = BATTERS[state.strikerIdx % BATTERS.length];
    state.strikerIdx += 1;
    emitWicketFall({ matchId: match.id, playerName, score: scoreStr, over });
  }

  console.log(
    `[sim] match ${match.id} | ${over}.${ballInOver} | ${outcome.label.padEnd(6)} | ${scoreStr} (${oversStr(
      state.balls
    )})`
  );
}

async function simTick() {
  try {
    // Only simulate locally-seeded LIVE matches (externalId === null). Real
    // CricAPI matches get genuine score pushes from the sync job instead.
    const live = await prisma.match.findMany({
      where: { status: 'LIVE', externalId: null },
      include: { homeTeam: true },
    });
    if (live.length === 0) return;
    for (const m of live) {
      await simulateMatch({
        id: m.id,
        homeTeamId: m.homeTeamId,
        homeTeam: { shortName: m.homeTeam.shortName },
        scorecard: m.scorecard,
      });
    }
  } catch (err) {
    console.error('[sim] tick failed:', (err as Error).message);
  }
}

let simTimer: NodeJS.Timeout | null = null;

function startSimulator() {
  // Dev only, and opt-out via SIMULATE_LIVE=false.
  if (process.env.NODE_ENV === 'production' || process.env.SIMULATE_LIVE === 'false') {
    console.log('[sim] disabled');
    return;
  }
  if (simTimer) return;
  simTimer = setInterval(simTick, 8000);
  console.log('[sim] live-match simulator running (every 8s)');
}
