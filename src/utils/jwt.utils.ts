import * as jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || "default_secret";
const JWT_REFRESH_SECRET =process.env.JWT_REFRESH_SECRET || "FALLBACK SECRET"

export const generateAccessToken = (userId: string, role:string ): string => {
    const options: jwt.SignOptions = { 
    expiresIn: "3m"
  };
  
  return jwt.sign({ userId, role }, JWT_SECRET, options);
}


export const generateRefreshToken = (userId: string): string => {
    const options: jwt.SignOptions = { 
    expiresIn: "5m"
  };
  
  return jwt.sign({ userId }, JWT_REFRESH_SECRET, options);
}

// Verify access token
export const verifyAccessToken = (token: string): { userId: string; role: string } | null => {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string; role: string };
  } catch {
    return null;
  }
};


export const verifyRefreshToken = (token: string): { userId: string } | null => {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET) as { userId: string };
  } catch {
    return null;
  }
};