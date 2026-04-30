import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { generateAccessToken } from "../src/utils/jwt.utils";

const connectionString = `${process.env.DATABASE_URL}`;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const analyst = await prisma.user.findUnique({
    where: { github_id: "test-analyst-github-id" },
  });

  if (!analyst) {
    console.log("No seeded analyst user found — run: npx prisma db seed");
    return;
  }

  if (!analyst.is_active) {
    console.log("Seeded analyst user is deactivated — check your DB");
    return;
  }

  const token = generateAccessToken(analyst.id, analyst.role);

  console.log("\n── Option 2 Analyst Token ───────────────────────────────");
  console.log("\nAnalyst Test Token (paste into submission form):");
  console.log(token);
  console.log("\n  This token expires in 3 minutes — submit immediately after copying");
  console.log("─────────────────────────────────────────────────────────\n");
}

main().finally(() => prisma.$disconnect());