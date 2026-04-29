import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { generateAccessToken } from "../src/utils/jwt.utils";

const connectionString = `${process.env.DATABASE_URL}`;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const analyst = await prisma.user.findFirst({
    where: { role: "analyst", is_active: true },
  });

  if (!analyst) {
    console.log("No analyst user found — run: npx prisma db seed");
    return;
  }

  const token = generateAccessToken(analyst.id, analyst.role);
  console.log("\nAnalyst Test Token (paste into submission form):");
  console.log(token);
  console.log("\n  This token expires in 3 minutes — submit immediately after copying");
}

main().finally(() => prisma.$disconnect());