import { Request, Response, NextFunction } from "express";
import { sendError } from "../utils/response.utils.js";
import {
  findAllProfiles,
  findAllProfilesForExport,
  findProfileById,
  createProfile,
  findProfileByName,
  deleteProfile
} from "../model/profile.model.js";
import { parseNaturalQuery } from "../utils/nlp.utils.js";
import { getGenderData } from "../services/genderize.service.js";
import { getAgeData } from "../services/agify.service.js";
import { getNationData } from "../services/nationalize.service.js";
import { uuidv7 } from "uuidv7";

const VALID_GENDERS = ["male", "female"];
const VALID_AGE_GROUPS = ["child", "teenager", "adult", "senior"];
const VALID_SORT_BY = ["age", "created_at", "gender_probability"];
const VALID_ORDER = ["asc", "desc"];

// Safely wraps a CSV cell — quotes the value if it contains commas, quotes, or newlines
const escapeCSV = (value: unknown): string => {
  const str = value === null || value === undefined ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

export const getAllProfiles = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      gender,
      age_group,
      country_id,
      min_age,
      max_age,
      min_gender_probability,
      min_country_probability,
      sort_by,
      order,
      page,
      limit,
    } = req.query;

    if (gender !== undefined && !VALID_GENDERS.includes(gender as string)) {
      return sendError(res, 422, "Invalid query parameters");
    }
    if (age_group !== undefined && !VALID_AGE_GROUPS.includes(age_group as string)) {
      return sendError(res, 422, "Invalid query parameters");
    }
    if (sort_by !== undefined && !VALID_SORT_BY.includes(sort_by as string)) {
      return sendError(res, 422, "Invalid query parameters");
    }
    if (order !== undefined && !VALID_ORDER.includes(order as string)) {
      return sendError(res, 422, "Invalid query parameters");
    }

    const parsedMinAge = min_age ? Number(min_age) : undefined;
    const parsedMaxAge = max_age ? Number(max_age) : undefined;
    const parsedMinGenderProb = min_gender_probability ? Number(min_gender_probability) : undefined;
    const parsedMinCountryProb = min_country_probability ? Number(min_country_probability) : undefined;
    const parsedPage = page ? Number(page) : undefined;
    const parsedLimit = limit ? Number(limit) : undefined;

    if (parsedMinAge !== undefined && isNaN(parsedMinAge)) {
      return sendError(res, 422, "Invalid query parameters");
    }
    if (parsedMaxAge !== undefined && isNaN(parsedMaxAge)) {
      return sendError(res, 422, "Invalid query parameters");
    }
    if (parsedMinGenderProb !== undefined && isNaN(parsedMinGenderProb)) {
      return sendError(res, 422, "Invalid query parameters");
    }
    if (parsedMinCountryProb !== undefined && isNaN(parsedMinCountryProb)) {
      return sendError(res, 422, "Invalid query parameters");
    }
    if (parsedPage !== undefined && (isNaN(parsedPage) || parsedPage < 1)) {
      return sendError(res, 422, "Invalid query parameters");
    }
    if (parsedLimit !== undefined && (isNaN(parsedLimit) || parsedLimit < 1)) {
      return sendError(res, 422, "Invalid query parameters");
    }

    const result = await findAllProfiles({
      gender: typeof gender === "string" ? gender : undefined,
      age_group: typeof age_group === "string" ? age_group : undefined,
      country_id: typeof country_id === "string" ? country_id : undefined,
      min_age: parsedMinAge,
      max_age: parsedMaxAge,
      min_gender_probability: parsedMinGenderProb,
      min_country_probability: parsedMinCountryProb,
      sort_by: sort_by as "age" | "created_at" | "gender_probability" | undefined,
      order: order as "asc" | "desc" | undefined,
      page: parsedPage,
      limit: parsedLimit,
    });

    const totalPages = Math.ceil(result.total / result.limit);

    return res.status(200).json({
      status: "success",
      page: result.page,
      limit: result.limit,
      total: result.total,
      total_pages: totalPages,
      links: {
        self: `/api/profiles?page=${result.page}&limit=${result.limit}`,
        next: result.page < totalPages
          ? `/api/profiles?page=${result.page + 1}&limit=${result.limit}`
          : null,
        prev: result.page > 1
          ? `/api/profiles?page=${result.page - 1}&limit=${result.limit}`
          : null,
      },
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
};

export const searchProfiles = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { q, page, limit } = req.query;

    if (!q || (q as string).trim() === "") {
      return sendError(res, 400, "Missing or empty query");
    }

    const filters = parseNaturalQuery(q as string);

    if (!filters) {
      return res.status(400).json({
        status: "error",
        message: "Unable to interpret query",
      });
    }

    const parsedPage = page ? Number(page) : undefined;
    const parsedLimit = limit ? Number(limit) : undefined;

    if (parsedPage !== undefined && (isNaN(parsedPage) || parsedPage < 1)) {
      return sendError(res, 422, "Invalid query parameters");
    }
    if (parsedLimit !== undefined && (isNaN(parsedLimit) || parsedLimit < 1)) {
      return sendError(res, 422, "Invalid query parameters");
    }

    const result = await findAllProfiles({
      ...filters,
      page: parsedPage,
      limit: parsedLimit,
    });

    const totalPages = Math.ceil(result.total / result.limit);

    return res.status(200).json({
      status: "success",
      page: result.page,
      limit: result.limit,
      total: result.total,
      total_pages: totalPages,
      links: {
        self: `/api/profiles/search?page=${result.page}&limit=${result.limit}`,
        next: result.page < totalPages
          ? `/api/profiles/search?page=${result.page + 1}&limit=${result.limit}`
          : null,
        prev: result.page > 1
          ? `/api/profiles/search?page=${result.page - 1}&limit=${result.limit}`
          : null,
      },
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
};

export const getProfileById = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    const profile = await findProfileById(id);

    if (!profile) {
      return sendError(res, 404, "Profile not found");
    }

    return res.status(200).json({
      status: "success",
      data: profile,
    });
  } catch (error) {
    next(error);
  }
};

export const createUserProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { name } = req.body;

    if (name === undefined) return sendError(res, 400, "Missing name");
    if (Array.isArray(name) || typeof name !== "string") return sendError(res, 422, "Invalid type");
    if (name.trim() === "") return sendError(res, 400, "Empty name");
    if (/^\d+$/.test(name.trim())) return sendError(res, 422, "Invalid type");

    const existingProfile = await findProfileByName(name);
    if (existingProfile) {
      return res.status(200).json({
        status: "success",
        message: "Profile already exists",
        data: existingProfile,
      });
    }

    const [genderData, ageData, nationData] = await Promise.all([
      getGenderData(name),
      getAgeData(name),
      getNationData(name),
    ]);

    const newProfile = await createProfile({
      id: uuidv7(),
      name,
      gender: genderData.gender,
      gender_probability: genderData.gender_probability,
      age: ageData.age,
      age_group: ageData.age_group,
      country_id: nationData.country_id,
      country_probability: nationData.country_probability,
    });

    return res.status(201).json({
      status: "success",
      data: newProfile,
    });
  } catch (error) {
    next(error);
  }
};

export const exportProfiles = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      format,
      gender,
      age_group,
      country_id,
      min_age,
      max_age,
      min_gender_probability,
      min_country_probability,
      sort_by,
      order,
    } = req.query;

    // Validate format param
    if (format !== "csv") {
      return sendError(res, 400, "format=csv is required");
    }

    // Validate optional filter params
    if (gender !== undefined && !VALID_GENDERS.includes(gender as string)) {
      return sendError(res, 422, "Invalid query parameters");
    }
    if (age_group !== undefined && !VALID_AGE_GROUPS.includes(age_group as string)) {
      return sendError(res, 422, "Invalid query parameters");
    }
    if (sort_by !== undefined && !VALID_SORT_BY.includes(sort_by as string)) {
      return sendError(res, 422, "Invalid query parameters");
    }
    if (order !== undefined && !VALID_ORDER.includes(order as string)) {
      return sendError(res, 422, "Invalid query parameters");
    }

    const parsedMinAge = min_age ? Number(min_age) : undefined;
    const parsedMaxAge = max_age ? Number(max_age) : undefined;
    const parsedMinGenderProb = min_gender_probability ? Number(min_gender_probability) : undefined;
    const parsedMinCountryProb = min_country_probability ? Number(min_country_probability) : undefined;

    if (parsedMinAge !== undefined && isNaN(parsedMinAge)) {
      return sendError(res, 422, "Invalid query parameters");
    }
    if (parsedMaxAge !== undefined && isNaN(parsedMaxAge)) {
      return sendError(res, 422, "Invalid query parameters");
    }
    if (parsedMinGenderProb !== undefined && isNaN(parsedMinGenderProb)) {
      return sendError(res, 422, "Invalid query parameters");
    }
    if (parsedMinCountryProb !== undefined && isNaN(parsedMinCountryProb)) {
      return sendError(res, 422, "Invalid query parameters");
    }

    // Fetch ALL matching profiles — no pagination cap
    const profiles = await findAllProfilesForExport({
      gender: typeof gender === "string" ? gender : undefined,
      age_group: typeof age_group === "string" ? age_group : undefined,
      country_id: typeof country_id === "string" ? country_id : undefined,
      min_age: parsedMinAge,
      max_age: parsedMaxAge,
      min_gender_probability: parsedMinGenderProb,
      min_country_probability: parsedMinCountryProb,
      sort_by: sort_by as "age" | "created_at" | "gender_probability" | undefined,
      order: order as "asc" | "desc" | undefined,
    });

    // TRD column order: id, name, gender, gender_probability, age, age_group,
    //                   country_id, country_name, country_probability, created_at
    const header = "id,name,gender,gender_probability,age,age_group,country_id,country_name,country_probability,created_at";

    const rows = profiles.map((p) =>
      [
        escapeCSV(p.id),
        escapeCSV(p.name),
        escapeCSV(p.gender),
        escapeCSV(p.gender_probability),
        escapeCSV(p.age),
        escapeCSV(p.age_group),
        escapeCSV(p.country_id),
        escapeCSV(p.country_name),
        escapeCSV(p.country_probability),
        escapeCSV(p.created_at.toISOString()),
      ].join(",")
    );

    const csv = [header, ...rows].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="profiles_${Date.now()}.csv"`
    );
    return res.status(200).send(csv);
  } catch (error) {
    next(error);
  }
};

export const deleteUserProfile = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    // Check existence first so we return 404 (not a Prisma crash)
    const existing = await findProfileById(id);
    if (!existing) {
      return sendError(res, 404, "Profile not found");
    }

    await deleteProfile(id);

    return res.status(200).json({
      status: "success",
      message: "Profile deleted successfully",
    });

  } catch (error) {
    next(error);
  }
} 

