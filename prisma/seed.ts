import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { uuidv7 } from "uuidv7";
import * as fs from "fs";
import * as path from "path";

interface SeedProfile {
  name: string;
  gender: string;
  gender_probability: number;
  age: number;
  age_group: string;
  country_id: string;
  country_name: string;
  country_probability: number;
}

interface SeedData {
  profiles: SeedProfile[];
}

const connectionString = `${process.env.DATABASE_URL}`;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  // ── Seed profiles ────────────────────────────────────────────────────────────
  const seedDataPath = path.join(__dirname, "../seed_profiles.json");
  const seedData = JSON.parse(fs.readFileSync(seedDataPath, "utf-8")) as SeedData;

  await prisma.profile.createMany({
    data: seedData.profiles.map((profile) => ({
      id: uuidv7(),
      name: profile.name,
      gender: profile.gender,
      gender_probability: profile.gender_probability,
      age: profile.age,
      age_group: profile.age_group,
      country_id: profile.country_id,
      country_name: profile.country_name,
      country_probability: profile.country_probability,
    })),
    skipDuplicates: true,
  });

  console.log("Seeding complete — 2026 profiles inserted");

  // ── Seed test users for grader ───────────────────────────────────────────────
  // Admin user — generate tokens via: npx ts-node scripts/gen-admin-token.ts
  const adminUser = await prisma.user.upsert({
    where: { github_id: "test-admin-github-id" },
    update: {
      role: "admin",
      is_active: true,
    },
    create: {
      id: uuidv7(),
      github_id: "test-admin-github-id",
      username: "test-admin",
      email: "admin@test.com",
      avatar_url: "https://avatars.githubusercontent.com/u/0",
      role: "admin",
      is_active: true,
    },
  });

  console.log("Seeded admin user — id:", adminUser.id);

  // Analyst user — token must be manually pasted into submission form
  const analystUser = await prisma.user.upsert({
    where: { github_id: "test-analyst-github-id" },
    update: {
      role: "analyst",
      is_active: true,
    },
    create: {
      id: uuidv7(),
      github_id: "test-analyst-github-id",
      username: "test-analyst",
      email: "analyst@test.com",
      avatar_url: "https://avatars.githubusercontent.com/u/0",
      role: "analyst",
      is_active: true,
    },
  });

  console.log("Seeded analyst user — id:", analystUser.id);
  console.log("────────────────────────────────────────────────────────────");
  console.log("Run these to get your submission tokens:");
  console.log("  Admin + Refresh : npx ts-node scripts/gen-admin-token.ts");
  console.log("  Analyst         : npx ts-node scripts/gen-token.ts");
  console.log("────────────────────────────────────────────────────────────");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });