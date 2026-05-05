// src/utils/cache-key.utils.ts

//normalization of queries
import { ProfileFilters } from "../model/profile.model";

export const buildCacheKey = (filters: ProfileFilters): string => {
  // Remove undefined values
  const cleaned = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== undefined)
  );

  // Sort keys alphabetically so order never matters
  
  const sorted = Object.keys(cleaned)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = cleaned[key];
      return acc;
    }, {});

  return `profiles:${JSON.stringify(sorted)}`;
};