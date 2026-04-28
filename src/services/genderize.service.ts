import axios from "axios"
import { AppError } from "../utils/apperror.utils.js"

interface GenderizeResponse {
    count: number,
    name: string,
    gender: "male" | "female" | null,
    probability: number
}

export const getGenderData = async(name: string) => {
    const {data} = await axios.get<GenderizeResponse>(
        `https://api.genderize.io?name=${name}`
    )

    // edge case check
  if (!data.gender || data.count === 0) {
   throw new AppError("Genderize returned an invalid response", 502);
  }

  return {
    gender: data.gender,
    gender_probability: data.probability,
    sample_size: data.count,
  };
}