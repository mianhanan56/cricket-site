import { config as loadEnv } from 'dotenv';
import path from 'path';
loadEnv({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';
import { rankingRows } from './rankingsData';

const prisma = new PrismaClient();

// Non-destructive rankings refresh: replaces ONLY the Ranking table with the
// current ICC data, leaving matches/teams/players/series untouched. Safe to run
// against a live dev DB (unlike the full `seed`, which resets everything).
async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.log('[seed:rankings] NODE_ENV=production — skipping.');
    return;
  }

  await prisma.ranking.deleteMany();
  await prisma.ranking.createMany({ data: rankingRows });
  console.log(`[seed:rankings] loaded ${rankingRows.length} ranking rows.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
