import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { generateAccessToken, generateRefreshToken } from "../src/utils/jwt.utils";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
  ssl: { rejectUnauthorized: false },
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const admin = await prisma.user.findUnique({
    where: { github_id: "test-admin-github-id" },
  });

  if (!admin) {
    console.log("No seeded admin user found — run: npx prisma db seed");
    return;
  }

  if (!admin.is_active) {
    console.log("Seeded admin user is deactivated — check your DB");
    return;
  }

  const accessToken = generateAccessToken(admin.id, admin.role);
  const refreshToken = generateRefreshToken(admin.id);

  await prisma.user.update({
    where: { id: admin.id },
    data: { refresh_token: refreshToken },
  });

  console.log("\n── Option 2 Tokens ──────────────────────────────────────");
  console.log("\nAdmin Test Token (paste into submission form):");
  console.log(accessToken);
  console.log("\nRefresh Test Token (paste into submission form):");
  console.log(refreshToken);
  console.log("\n  Tokens expire in 3m (access) / 5m (refresh).");
  console.log("  Paste both into the submission form and submit immediately.");
  console.log("─────────────────────────────────────────────────────────\n");
}

main().finally(() => prisma.$disconnect());