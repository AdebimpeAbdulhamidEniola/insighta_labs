import { prisma } from "../lib/prisma.js";

export interface ProfileFilters {
  gender?: string;
  age_group?: string;
  country_id?: string;
  min_age?: number;
  max_age?: number;
  min_gender_probability?: number;
  min_country_probability?: number;
  sort_by?: "age" | "created_at" | "gender_probability";
  order?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export const findAllProfiles = async (filters: ProfileFilters) => {
  const where = {
    ...(filters.gender && {
      gender: { equals: filters.gender, mode: "insensitive" as const },
    }),
    ...(filters.age_group && {
      age_group: { equals: filters.age_group, mode: "insensitive" as const },
    }),
    ...(filters.country_id && {
      country_id: { equals: filters.country_id, mode: "insensitive" as const },
    }),
    ...((filters.min_age !== undefined || filters.max_age !== undefined) && {
      age: {
        ...(filters.min_age !== undefined && { gte: filters.min_age }),
        ...(filters.max_age !== undefined && { lte: filters.max_age }),
      },
    }),
    ...(filters.min_gender_probability !== undefined && {
      gender_probability: { gte: filters.min_gender_probability },
    }),
    ...(filters.min_country_probability !== undefined && {
      country_probability: { gte: filters.min_country_probability },
    }),
  };

  const page = filters.page ?? 1;
  const limit = Math.min(filters.limit ?? 10, 50);
  const skip = (page - 1) * limit;

  const orderBy = filters.sort_by
    ? { [filters.sort_by]: filters.order ?? "asc" }
    : { created_at: "asc" as const };

  const [data, total] = await Promise.all([
    prisma.profile.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      select: {
        id: true,
        name: true,
        gender: true,
        gender_probability: true,
        age: true,
        age_group: true,
        country_id: true,
        country_name: true,
        country_probability: true,
        created_at: true,
      },
    }),
    prisma.profile.count({ where }),
  ]);

  return { data, total, page, limit };
};

// Separate export query — no pagination cap, fetches everything matching filters
export const findAllProfilesForExport = async (
  filters: Omit<ProfileFilters, "page" | "limit">
) => {
  const where = {
    ...(filters.gender && {
      gender: { equals: filters.gender, mode: "insensitive" as const },
    }),
    ...(filters.age_group && {
      age_group: { equals: filters.age_group, mode: "insensitive" as const },
    }),
    ...(filters.country_id && {
      country_id: { equals: filters.country_id, mode: "insensitive" as const },
    }),
    ...((filters.min_age !== undefined || filters.max_age !== undefined) && {
      age: {
        ...(filters.min_age !== undefined && { gte: filters.min_age }),
        ...(filters.max_age !== undefined && { lte: filters.max_age }),
      },
    }),
    ...(filters.min_gender_probability !== undefined && {
      gender_probability: { gte: filters.min_gender_probability },
    }),
    ...(filters.min_country_probability !== undefined && {
      country_probability: { gte: filters.min_country_probability },
    }),
  };

  const orderBy = filters.sort_by
    ? { [filters.sort_by]: filters.order ?? "asc" }
    : { created_at: "asc" as const };

  return prisma.profile.findMany({
    where,
    orderBy,
    select: {
      id: true,
      name: true,
      gender: true,
      gender_probability: true,
      age: true,
      age_group: true,
      country_id: true,
      country_name: true,
      country_probability: true,
      created_at: true,
    },
  });
};

export const findProfileById = (id: string) => {
  return prisma.profile.findUnique({ where: { id } });
};

export const createProfile = async (data: {
  id: string;
  name: string;
  gender: string;
  gender_probability: number;
  age: number;
  age_group: string;
  country_id: string;
  country_name?: string | null;
  country_probability: number;
}) => {
  return await prisma.profile.create({ data });
};

export const findProfileByName = (name: string) => {
  return prisma.profile.findUnique({ where: { name } });
};


export const deleteProfile = (id: string) => {
  return prisma.profile.delete({ where: { id } });
};