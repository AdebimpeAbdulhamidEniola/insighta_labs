import {prisma} from "../lib/prisma"
import { uuidv7 } from "uuidv7";

interface GitHubUserPayload {
  githubId: string;
  username: string;
  email: string;
  avatarUrl: string;
}

/**
 * Creates a new user on first login, or updates their profile fields on every
 * subsequent login. The lookup key is `github_id`, which is stable and unique
 * across GitHub account renames.
 */
export const upsertGitHubUser = (payload: GitHubUserPayload) => {
  return prisma.user.upsert({
    where: { github_id: payload.githubId },
    update: {
      username: payload.username,
      email: payload.email,
      avatar_url: payload.avatarUrl,
      last_login_at: new Date(),
    },
    create: {
      id: uuidv7(),
      github_id: payload.githubId,
      username: payload.username,
      email: payload.email,
      avatar_url: payload.avatarUrl,
      role: "analyst",
    },
  });
};

/**
 * Fetches a single user row. Used during token refresh to verify the stored
 * refresh token matches the one the client sent (replay-attack prevention).
 */
export const findUserById = (id: string) => {
  return prisma.user.findUnique({ where: { id } });
};

/**
 * Writes a new refresh token to the user row.
 * Passing `null` effectively logs the user out by invalidating all sessions.
 */
export const setRefreshToken = (userId: string, token: string | null) => {
  return prisma.user.update({
    where: { id: userId },
    data: { refresh_token: token },
  });
};