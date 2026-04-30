import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { generateAccessToken, generateRefreshToken } from "../src/utils/jwt.utils";

const connectionString = `${process.env.DATABASE_URL}`;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const admin = await prisma.user.findFirst({
    where: { role: "admin", is_active: true },
  });

  if (!admin) {
    console.log("No admin user found — run: npx prisma db seed");
    return;
  }

  const accessToken = generateAccessToken(admin.id, admin.role);
  const refreshToken = generateRefreshToken(admin.id);

  // Persist the refresh token to the DB so the grader's POST /auth/refresh
  // call succeeds — the refreshAccessToken controller checks that
  // user.refresh_token === the token the client sends (replay-attack guard).
  await prisma.user.update({
    where: { id: admin.id },
    data: { refresh_token: refreshToken },
  });

  console.log("\n── Option 2 Tokens ──────────────────────────────────────");
  console.log("\nAdmin Test Token (paste into submission form):");
  console.log(accessToken);
  console.log("\nRefresh Test Token (paste into submission form):");
  console.log(refreshToken);
  console.log("\n  Tokens expire in 3m / 5m — submit immediately after copying");
  console.log("─────────────────────────────────────────────────────────\n");
}

main().finally(() => prisma.$disconnect());