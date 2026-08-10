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
//
// An existing team's shortName is refreshed from the provider when it differs.
// That matters more than it looks: innings are labelled "<SHORT> Inning <n>", and
// the UI pairs an innings with a team by testing whether the label contains the
// team's name or shortName. A row left on a previous provider's code (CricAPI
// wrote Durham as "DURH", CricLive uses "DUR") matches neither, so the team's
// score silently renders blank.
async function findOrCreateTeam(name: string, info?: { shortname?: string; img?: string }) {
  const shortName = (info?.shortname ?? name.slice(0, 3)).toUpperCase();
  const existing = await prisma.team.findFirst({ where: { name } });

  if (existing) {
    const staleShort = Boolean(info?.shortname) && existing.shortName !== shortName;
    const missingLogo = !existing.logo && Boolean(info?.img);
    if (!staleShort && !missingLogo) return existing;

    return prisma.team.update({
      where: { id: existing.id },
      data: {
        ...(staleShort ? { shortName } : {}),
        ...(missingLogo ? { logo: info?.img } : {}),
      },
    });
  }

  return prisma.team.create({
    data: { name, shortName, country: name, logo: info?.img ?? null },
  });
}

async function findOrCreateSeries(name: string, format: string) {
  const existing = await prisma.series.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.series.create({
    data: { name, startDate: new Date(), endDate: new Date(), format },
  });
}

/** Upsert one CricLive match (+ its teams/series) into the DB. */
async function syncMatch(m: CricApiMatch) {
  if (!m.teams || m.teams.length < 2) return null;

  const infoFor = (n: string) => m.teamInfo?.find((t) => t.name === n);
  const home = await findOrCreateTeam(m.teams[0], infoFor(m.teams[0]));
  const away = await findOrCreateTeam(m.teams[1], infoFor(m.teams[1]));

  const format = mapFormat(m);
  // CricLive reports the series as its own field ("Afghanistan tour of Ireland,
  // 2026"), so use it directly. Only fall back to splitting the match name for
  // providers that bury the series inside it — and note that CricLive titles
  // ("<Series>, <year> - 2nd ODI") must NOT be comma-split, since that would
  // yield "2026 - 2nd ODI" as the series name.
  const seriesName =
    m.series_name?.trim() ||
    m.name?.split(' - ')[0]?.trim() ||
    'International';
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
      externalSlug: m.slug ?? null,
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
      externalSlug: m.slug ?? null,
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
    console.warn('⚠️ daily upstream call budget nearly exhausted, skipping sync');
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
  // Every 30 min. The Worker's edge cache absorbs repeat reads, so this is well
  // inside CricLive's limits — tighten the interval if you want fresher rows.
  cron.schedule('*/30 * * * *', runSync);
  console.log('[sync] cron scheduled (every 30 min)');
}

// Fire an immediate sync as soon as this module is loaded, so fresh data is
// pulled the moment the server process starts. (startSyncJob then keeps it
// running every 15 min.) This single call replaces the previous boot-time run.
void runSync();
