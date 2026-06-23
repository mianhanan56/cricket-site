import { config as loadEnv } from 'dotenv';
import path from 'path';
loadEnv({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Idempotent: clear existing rows (respecting FK order) before re-seeding.
  await prisma.match.deleteMany();
  await prisma.series.deleteMany();
  await prisma.player.deleteMany();
  await prisma.team.deleteMany();
  await prisma.newsArticle.deleteMany();
  await prisma.ranking.deleteMany();

  // --- Teams ---------------------------------------------------------------
  const india = await prisma.team.create({
    data: { name: 'India', shortName: 'IND', country: 'India' },
  });
  const australia = await prisma.team.create({
    data: { name: 'Australia', shortName: 'AUS', country: 'Australia' },
  });

  // --- Series --------------------------------------------------------------
  const series = await prisma.series.create({
    data: {
      name: 'IND vs AUS 2024',
      startDate: new Date('2024-11-22'),
      endDate: new Date('2024-12-15'),
      format: 'ODI',
    },
  });

  // --- Players -------------------------------------------------------------
  const kohli = await prisma.player.create({
    data: {
      name: 'Virat Kohli',
      country: 'India',
      role: 'BATSMAN',
      battingStyle: 'Right-handed',
      bowlingStyle: 'Right-arm medium',
      stats: {
        batting: {
          matches: 295,
          innings: 283,
          runs: 13848,
          average: 57.7,
          strikeRate: 93.6,
          hundreds: 50,
          fifties: 72,
          fours: 1305,
          sixes: 152,
          highScore: 183,
        },
      },
    },
  });
  const smith = await prisma.player.create({
    data: {
      name: 'Steve Smith',
      country: 'Australia',
      role: 'BATSMAN',
      battingStyle: 'Right-handed',
      bowlingStyle: 'Right-arm legbreak',
      stats: {
        batting: {
          matches: 167,
          innings: 188,
          runs: 5800,
          average: 43.3,
          strikeRate: 87.1,
          hundreds: 12,
          fifties: 35,
          fours: 520,
          sixes: 42,
          highScore: 164,
        },
      },
    },
  });
  await prisma.player.create({
    data: {
      name: 'Jasprit Bumrah',
      country: 'India',
      role: 'BOWLER',
      battingStyle: 'Right-handed',
      bowlingStyle: 'Right-arm fast',
      stats: {
        bowling: {
          matches: 89,
          innings: 88,
          wickets: 149,
          average: 24.3,
          economy: 4.6,
          strikeRate: 31.6,
          fiveWickets: 2,
          bestBowling: '6/19',
        },
      },
    },
  });

  // --- LIVE match ----------------------------------------------------------
  const match = await prisma.match.create({
    data: {
      homeTeamId: india.id,
      awayTeamId: australia.id,
      seriesId: series.id,
      format: 'ODI',
      status: 'LIVE',
      venue: 'Wankhede Stadium, Mumbai',
      startTime: new Date('2024-11-22T08:30:00Z'),
      scorecard: {
        innings: [
          {
            teamId: india.id,
            teamShortName: 'IND',
            runs: 287,
            wickets: 4,
            overs: 45.2,
            runRate: 6.33,
          },
        ],
        currentInnings: 0,
        batting: [
          {
            playerId: kohli.id,
            name: 'Virat Kohli',
            runs: 112,
            balls: 98,
            fours: 9,
            sixes: 2,
            strikeRate: 114.3,
            out: false,
          },
        ],
        commentary: [
          {
            id: 'c1',
            over: 45,
            ball: 2,
            runs: 4,
            isWicket: false,
            isBoundary: true,
            text: 'Kohli drives through the covers for FOUR!',
            timestamp: new Date('2024-11-22T12:10:00Z').toISOString(),
          },
        ],
      },
    },
  });

  // --- Upcoming fixtures (so the Fixtures page has real data) --------------
  await prisma.match.create({
    data: {
      homeTeamId: india.id,
      awayTeamId: australia.id,
      seriesId: series.id,
      format: 'T20',
      status: 'UPCOMING',
      venue: 'M. Chinnaswamy Stadium, Bengaluru',
      startTime: new Date('2026-07-01T13:30:00Z'),
    },
  });
  await prisma.match.create({
    data: {
      homeTeamId: australia.id,
      awayTeamId: india.id,
      seriesId: series.id,
      format: 'TEST',
      status: 'UPCOMING',
      venue: 'Melbourne Cricket Ground',
      startTime: new Date('2026-07-05T03:30:00Z'),
    },
  });

  // --- News ----------------------------------------------------------------
  const article = await prisma.newsArticle.create({
    data: {
      title: 'Kohli century powers India against Australia',
      slug: 'kohli-century-powers-india-vs-australia',
      excerpt: 'A masterclass hundred from Virat Kohli puts India in command at the Wankhede.',
      content:
        'Virat Kohli brought up his 51st ODI hundred with a commanding knock as India posted a strong total against Australia in the series opener. The chase-master once again proved why he is among the greatest of all time, anchoring the innings through the middle overs before accelerating at the death.',
      author: 'CREX Desk',
      tags: ['India', 'Australia', 'ODI', 'Virat Kohli'],
    },
  });
  await prisma.newsArticle.create({
    data: {
      title: 'Steve Smith returns to form ahead of the Test series',
      slug: 'steve-smith-returns-to-form',
      excerpt: 'Australia’s mainstay looks ominous heading into a packed cricket calendar.',
      content:
        'Steve Smith rolled back the years with a fluent half-century in the warm-up fixture, easing concerns over his recent lean patch ahead of a crucial Test series.',
      author: 'CREX Desk',
      tags: ['Australia', 'Steve Smith', 'Test'],
    },
  });
  await prisma.newsArticle.create({
    data: {
      title: 'Wankhede pitch report: batting paradise expected',
      slug: 'wankhede-pitch-report-batting-paradise',
      excerpt: 'Curators promise a true surface with plenty on offer for the stroke-makers.',
      content:
        'The Wankhede track has historically favoured batters under lights, and this fixture is expected to be no different with a fast outfield and short square boundaries.',
      author: 'CREX Desk',
      tags: ['India', 'Pitch Report', 'ODI'],
    },
  });

  // --- ICC Rankings (MEN) --------------------------------------------------
  const battingRanks = [
    { playerName: 'Shubman Gill', country: 'India', rating: 784, points: 784 },
    { playerName: 'Babar Azam', country: 'Pakistan', rating: 768, points: 768 },
    { playerName: 'Rohit Sharma', country: 'India', rating: 756, points: 756 },
    { playerName: 'Steve Smith', country: 'Australia', rating: 740, points: 740 },
    { playerName: 'Kane Williamson', country: 'New Zealand', rating: 725, points: 725 },
  ];
  const bowlingRanks = [
    { playerName: 'Jasprit Bumrah', country: 'India', rating: 810, points: 810 },
    { playerName: 'Kagiso Rabada', country: 'South Africa', rating: 762, points: 762 },
    { playerName: 'Josh Hazlewood', country: 'Australia', rating: 748, points: 748 },
    { playerName: 'Pat Cummins', country: 'Australia', rating: 731, points: 731 },
    { playerName: 'Ravindra Jadeja', country: 'India', rating: 712, points: 712 },
  ];

  await prisma.ranking.createMany({
    data: [
      ...battingRanks.map((r, i) => ({ ...r, role: 'BATTING', gender: 'MEN', position: i + 1 })),
      ...bowlingRanks.map((r, i) => ({ ...r, role: 'BOWLING', gender: 'MEN', position: i + 1 })),
    ],
  });

  console.log('[seed] done. Created IDs:');
  console.log(
    JSON.stringify(
      {
        teams: { india: india.id, australia: australia.id },
        series: series.id,
        match: match.id,
        players: { kohli: kohli.id, smith: smith.id },
        newsSlug: article.slug,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
