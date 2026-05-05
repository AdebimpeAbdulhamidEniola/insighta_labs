import { Request, Response, NextFunction } from "express";
import fs from "fs";
import { parse } from "csv-parse";
import { profileCache } from "../lib/cache";
import { sendError } from "../utils/response.utils";
import { findExistingNames, insertProfiles, ValidRow } from "../model/ingestion.model";

const CHUNK_SIZE = 500;
const VALID_GENDERS = ["male", "female"];
const VALID_AGE_GROUPS = ["child", "teenager", "adult", "senior"];

interface SkipReasons {
  duplicate_name: number;
  invalid_age: number;
  missing_fields: number;
  invalid_gender: number;
  malformed_row: number;
}
const processChunk = async (
  rows: ValidRow[],
  inserted: { count: number },
  reasons: SkipReasons
): Promise<void> => {
  const names = rows.map((r) => r.name);
  const existingNames = await findExistingNames(names);

  const toInsert = rows.filter((r) => {
    if (existingNames.has(r.name)) {
      reasons.duplicate_name++;
      return false;
    }
    return true;
  });

  if (toInsert.length === 0) return;

  await insertProfiles(toInsert);

  inserted.count += toInsert.length;
};

export const uploadCSV = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (!req.file) {
    sendError(res, 400, "No file uploaded");
    return;
  }

  const filePath = req.file.path;

  let totalRows = 0;
  const inserted = { count: 0 };
  const reasons: SkipReasons = {
    duplicate_name: 0,
    invalid_age: 0,
    missing_fields: 0,
    invalid_gender: 0,
    malformed_row: 0,
  };

  try {
    const chunk: ValidRow[] = [];

    const parser = fs.createReadStream(filePath).pipe(
      parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: false,
      })
    );

    for await (const row of parser) {
      totalRows++;

      const {
        name,
        gender,
        gender_probability,
        age,
        age_group,
        country_id,
        country_probability,
      } = row;

      if (
        !name ||
        !gender ||
        gender_probability === undefined ||
        age === undefined ||
        !age_group ||
        !country_id ||
        country_probability === undefined
      ) {
        reasons.missing_fields++;
        continue;
      }

      if (!VALID_GENDERS.includes((gender as string).toLowerCase())) {
        reasons.invalid_gender++;
        continue;
      }

      const parsedAge = Number(age);
      if (isNaN(parsedAge) || parsedAge < 0 || !Number.isInteger(parsedAge)) {
        reasons.invalid_age++;
        continue;
      }

      if (!VALID_AGE_GROUPS.includes(age_group as string)) {
        reasons.invalid_age++;
        continue;
      }

      const parsedGenderProb = Number(gender_probability);
      const parsedCountryProb = Number(country_probability);

      if (isNaN(parsedGenderProb) || isNaN(parsedCountryProb)) {
        reasons.malformed_row++;
        continue;
      }

      chunk.push({
        name: (name as string).trim(),
        gender: (gender as string).toLowerCase(),
        gender_probability: parsedGenderProb,
        age: parsedAge,
        age_group: age_group as string,
        country_id: (country_id as string).toUpperCase(),
        country_name: (row.country_name as string) || null,
        country_probability: parsedCountryProb,
      });

      if (chunk.length === CHUNK_SIZE) {
        await processChunk(chunk, inserted, reasons);
        chunk.length = 0;
      }
    }

    if (chunk.length > 0) {
      await processChunk(chunk, inserted, reasons);
    }

  } catch (error) {
    fs.unlink(filePath, () => {});
    next(error);
    return;
  }

  fs.unlink(filePath, () => {});

  profileCache.invalidate();

  const skipped = totalRows - inserted.count;

  res.status(200).json({
    status: "success",
    total_rows: totalRows,
    inserted: inserted.count,
    skipped,
    reasons,
  });
};