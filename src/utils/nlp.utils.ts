import { ProfileFilters } from "../model/profile.model";

const COUNTRY_MAP: Record<string, string> = {
  // A
  "angola": "AO",
  "australia": "AU",
  "algeria": "DZ",
  // B
  "burkina faso": "BF",
  "burundi": "BI",
  "benin": "BJ",
  "brazil": "BR",
  "botswana": "BW",
  // C
  "canada": "CA",
  "dr congo": "CD",
  "democratic republic of congo": "CD",
  "democratic republic of the congo": "CD",
  "central african republic": "CF",
  "republic of the congo": "CG",
  "congo": "CG",
  "ivory coast": "CI",
  "cote d'ivoire": "CI",
  "côte d'ivoire": "CI",
  "cameroon": "CM",
  "china": "CN",
  "cape verde": "CV",
  "comoros": "KM",
  "chad": "TD",
  // D
  "djibouti": "DJ",
  // E
  "egypt": "EG",
  "western sahara": "EH",
  "eritrea": "ER",
  "ethiopia": "ET",
  "equatorial guinea": "GQ",
  "eswatini": "SZ",
  // F
  "france": "FR",
  // G
  "gabon": "GA",
  "united kingdom": "GB",
  "uk": "GB",
  "britain": "GB",
  "ghana": "GH",
  "gambia": "GM",
  "guinea": "GN",
  "guinea-bissau": "GW",
  "germany": "DE",
  // I
  "india": "IN",
  // J
  "japan": "JP",
  // K
  "kenya": "KE",
  // L
  "liberia": "LR",
  "lesotho": "LS",
  "libya": "LY",
  // M
  "morocco": "MA",
  "madagascar": "MG",
  "mali": "ML",
  "mauritania": "MR",
  "mauritius": "MU",
  "malawi": "MW",
  "mozambique": "MZ",
  // N
  "namibia": "NA",
  "niger": "NE",
  "nigeria": "NG",
  // R
  "rwanda": "RW",
  // S
  "sudan": "SD",
  "sierra leone": "SL",
  "senegal": "SN",
  "somalia": "SO",
  "south sudan": "SS",
  "sao tome and principe": "ST",
  "são tomé and príncipe": "ST",
  "seychelles": "SC",
  "south africa": "ZA",
  // T
  "togo": "TG",
  "tunisia": "TN",
  "tanzania": "TZ",
  // U
  "uganda": "UG",
  "united states": "US",
  "usa": "US",
  "america": "US",
  // Z
  "zambia": "ZM",
  "zimbabwe": "ZW",
};

export const parseNaturalQuery = (q: string): ProfileFilters | null => {
  const query = q.toLowerCase().trim();

  if (!query) return null;

  const filters: ProfileFilters = {};
  let matched = false;

  // ── Gender ──────────────────────────────────────────
  const bothGenders = /\b(male and female|female and male|both)\b/.test(query);

  if (!bothGenders) {
    if (/\b(male|males|man|men)\b/.test(query)) {
      filters.gender = "male";
      matched = true;
    } else if (/\b(female|females|woman|women)\b/.test(query)) {
      filters.gender = "female";
      matched = true;
    }
  } else {
    matched = true;
  }

  // ── Age group / young ───────────────────────────────
  if (/\byoung\b/.test(query)) {
    filters.min_age = 16;
    filters.max_age = 24;
    matched = true;
  } else if (/\b(child|children|kid|kids)\b/.test(query)) {
    filters.age_group = "child";
    matched = true;
  } else if (/\b(teenager|teenagers|teen|teens)\b/.test(query)) {
    filters.age_group = "teenager";
    matched = true;
  } else if (/\b(adult|adults)\b/.test(query)) {
    filters.age_group = "adult";
    matched = true;
  } else if (/\b(senior|seniors|elderly|old)\b/.test(query)) {
    filters.age_group = "senior";
    matched = true;
  }

  // ── Age range ────────────────────────────────────────
  // "above 30" / "over 30" / "older than 30"
  const aboveMatch = query.match(/\b(?:above|over|older than)\s+(\d+)\b/);
  if (aboveMatch) {
    filters.min_age = parseInt(aboveMatch[1]);
    matched = true;
  }

  // "below 30" / "under 30" / "younger than 30"
  const belowMatch = query.match(/\b(?:below|under|younger than)\s+(\d+)\b/);
  if (belowMatch) {
    filters.max_age = parseInt(belowMatch[1]);
    matched = true;
  }

  // "between 20 and 30"
  const betweenMatch = query.match(/\bbetween\s+(\d+)\s+and\s+(\d+)\b/);
  if (betweenMatch) {
    filters.min_age = parseInt(betweenMatch[1]);
    filters.max_age = parseInt(betweenMatch[2]);
    matched = true;
  }

  // ── Country ──────────────────────────────────────────
  // Try multi-word country names first (longest match wins)
  const sortedCountries = Object.keys(COUNTRY_MAP).sort(
    (a, b) => b.length - a.length
  );

  for (const countryName of sortedCountries) {
    if (query.includes(countryName)) {
      filters.country_id = COUNTRY_MAP[countryName];
      matched = true;
      break;
    }
  }

  if (!matched) return null;

  return filters;
};