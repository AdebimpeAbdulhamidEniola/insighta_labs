import axios from "axios";
import { AppError } from "../utils/apperror.utils.js";

interface NationalizeResponse {
  count: number;
  name: string;
  country: {
    country_id: string;
    probability: number;
  }[];
}

export const getNationData = async (name: string) => {
  const { data } = await axios.get<NationalizeResponse>(
    `https://api.nationalize.io?name=${name}`,
  );

  if(!data || !data.country || data.country.length === 0) {
     throw new AppError("Nationalize returned an invalid response", 502);
  }

  //pick the country with the highest probability
  const topCountry = data.country.reduce((prev, curr) =>
    curr.probability > prev.probability ? curr : prev,
  );


  return {
    country_id: topCountry.country_id,
     country_probability: topCountry.probability,

  };
};