import { prisma } from "../lib/prisma";
import { uuidv7 } from "uuidv7";

export interface ValidRow {
  name: string;
  gender: string;
  gender_probability: number;
  age: number;
  age_group: string;
  country_id: string;
  country_name: string | null;
  country_probability: number;
}

export const findExistingNames = async (names: string[]): Promise<Set<string>> => {
  const existing = await prisma.profile.findMany({
    where: { name: { in: names } },
    select: { name: true },
  });

  return new Set(existing.map((e) => e.name));
};

export const insertProfiles = async (rows: ValidRow[]): Promise<void> => {
  await prisma.profile.createMany({
    data: rows.map((r) => ({
      id: uuidv7(),
      ...r,
    })),
    skipDuplicates: true,
  });
};