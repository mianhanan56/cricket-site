import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import {
  fetchLiveMatches,
  mapStatus,
  mapFormat,
  mapStartTime,
  mapScorecard,
  apiConfigured,
  type CricApiMatch,
} from '../services/cricketApi';
import { broadcastScoreUpdate } from '../socket';
import { quotaNearlyExhausted } from '../lib/usage';

// Teams/Series have no natural unique key in our schema, so find-or-create.
async function findOrCreateTeam(name: string, info?: { shortname?: string; img?: string }) {
  const existing = await prisma.team.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.team.create({
    data: {
      name,
      shortName: (info?.shortname ?? name.slice(0, 3)).toUpperCase(),
      country: name,
      logo: info?.img ?? null,
    },
  });
}

async function findOrCreateSeries(name: string, format: string) {
  const existing = await prisma.series.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.series.create({
    data: { name, startDate: new Date(), endDate: new Date(), format },
  });
}

/** Upsert one CricAPI match (+ its teams/series) into the DB. */
async function syncMatch(m: CricApiMatch) {
  if (!m.teams || m.teams.length < 2) return null;

  const infoFor = (n: string) => m.teamInfo?.find((t) => t.name === n);
  const home = await findOrCreateTeam(m.teams[0], infoFor(m.teams[0]));
  const away = await findOrCreateTeam(m.teams[1], infoFor(m.teams[1]));

  const format = mapFormat(m);
  // Series name: CricAPI match names look like "Team A vs Team B, 1st ODI, <Series>".
  const seriesName = m.name?.split(',').slice(-1)[0]?.trim() || m.name?.split(',')[0]?.trim() || 'International';
  const series = await findOrCreateSeries(seriesName, format);

  let status = mapStatus(m);
  // Safety net: a match scheduled more than 2 hours ago that's still flagged
  // UPCOMING is almost certainly over — force it to COMPLETED.
  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
  if (status === 'UPCOMING' && Date.now() - mapStartTime(m).getTime() > TWO_HOURS_MS) {
    status = 'COMPLETED';
  }
  const scorecard = mapScorecard(m);

  return prisma.match.upsert({
    where: { externalId: m.id },
    create: {
      externalId: m.id,
      homeTeamId: home.id,
      awayTeamId: away.id,
      seriesId: series.id,
      format,
      status,
      venue: m.venue ?? 'TBD',
      startTime: mapStartTime(m),
      result: m.matchEnded ? m.status : null,
      scorecard,
    },
    update: {
      status,
      venue: m.venue ?? 'TBD',
      result: m.matchEnded ? m.status : null,
      scorecard,
    },
  });
}

export async function runSync(): Promise<number> {
  console.log(`[sync] run started at ${new Date().toISOString()}`);

  if (!apiConfigured()) {
    console.warn('[sync] cricket provider not configured — skipping (serving seeded DB data)');
    return 0;
  }

  if (await quotaNearlyExhausted()) {
    console.warn('⚠️ CricAPI daily quota nearly exhausted (90+), skipping sync');
    return 0;
  }

  try {
    const matches = await fetchLiveMatches();
    let count = 0;

    for (const m of matches) {
      const saved = await syncMatch(m).catch((e) => {
        console.warn(`[sync] skipped "${m.name}": ${(e as Error).message}`);
        return null;
      });
      if (!saved) continue;
      count++;
      // Push real score to subscribed clients (replaces the fake simulator).
      if (saved.status === 'LIVE') {
        await broadcastScoreUpdate(saved.id).catch(() => undefined);
      }
    }

    console.log(`✅ Synced ${count} matches at ${new Date().toISOString()}`);
    return count;
  } catch (err) {
    console.error(`[sync] failed: ${(err as Error).message} — DB data still served`);
    return 0;
  }
}

export function startSyncJob() {
  // Every 30 min = 48 calls/day, comfortably under the 100/day free plan.
  cron.schedule('*/30 * * * *', runSync);
  console.log('[sync] cron scheduled (every 30 min)');
}

// Fire an immediate sync as soon as this module is loaded, so fresh data is
// pulled the moment the server process starts. (startSyncJob then keeps it
// running every 15 min.) This single call replaces the previous boot-time run.
void runSync();
