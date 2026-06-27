import { config as loadEnv } from 'dotenv';
import path from 'path';
// scripts/ -> src/ -> backend/ -> repo root .env (provides DATABASE_URL)
loadEnv({ path: path.resolve(__dirname, '../../../.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Locally-seeded matches have a null externalId; real CricAPI-synced matches
// always carry one. Deleting null-externalId rows removes only the seed data.
async function main() {
  const deleted = await prisma.match.deleteMany({
    where: { externalId: null },
  });
  console.log(`Deleted ${deleted.count} seed matches`);
  await prisma.$disconnect();
}

main();
