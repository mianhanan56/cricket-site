import { config as loadEnv } from 'dotenv';
import path from 'path';
// scripts/ -> src/ -> backend/ -> repo root .env
loadEnv({ path: path.resolve(__dirname, '../../../.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Removes locally-seeded sample data (e.g. the fixture "IND vs AUS 2024"
// matches) from whatever database DATABASE_URL points at. Locally-seeded
// matches have a null externalId; real CricAPI-synced matches do not.
async function clean() {
  const matches = await prisma.match.deleteMany({ where: { externalId: null } });
  const series = await prisma.series.deleteMany({ where: { name: 'IND vs AUS 2024' } });
  console.log(`Seed data removed: ${matches.count} match(es), ${series.count} series.`);
  await prisma.$disconnect();
}

clean().catch(async (err) => {
  console.error('[cleanSeedData] failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
