import { prisma } from "../lib/prisma";
import { uuidv7 } from "uuidv7";

interface GitHubUserPayload {
  githubId: string;
  username: string;
  email: string;
  avatarUrl: string;
}

/**
 * Reads ADMIN_GITHUB_IDS from env (comma-separated list of GitHub user IDs).
 * If the logging-in user's GitHub ID is in this list, they are assigned the
 * "admin" role. Everyone else defaults to "analyst".
 *
 * Example .env entry:
 *   ADMIN_GITHUB_IDS=12345678,87654321
 */
const getAdminGithubIds = (): string[] => {
  return (process.env.ADMIN_GITHUB_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
};

/**
 * Creates a new user on first login, or updates their profile fields on every
 * subsequent login. The lookup key is `github_id`, which is stable and unique
 * across GitHub account renames.
 *
 * Role logic:
 *  - If user already exists → keep their existing role (do NOT downgrade admins)
 *  - If new user → assign "admin" if their GitHub ID is in ADMIN_GITHUB_IDS,
 *    otherwise assign "analyst"
 */
export const upsertGitHubUser = async (payload: GitHubUserPayload) => {
  const adminIds = getAdminGithubIds();
  const userCount = await prisma.user.count();
  const isFirstUser = userCount === 0;

  const isAdmin = adminIds.includes(payload.githubId) || isFirstUser;

  // Check if user already exists so we don't overwrite an existing admin role
  const existingUser = await prisma.user.findUnique({
    where: { github_id: payload.githubId },
  });

  return prisma.user.upsert({
    where: { github_id: payload.githubId },
    update: {
      username: payload.username,
      email: payload.email,
      avatar_url: payload.avatarUrl,
      last_login_at: new Date(),
      // Only update role if they are being promoted to admin and aren't already
      ...(isAdmin && existingUser?.role !== "admin" && { role: "admin" }),
    },
    create: {
      id: uuidv7(),
      github_id: payload.githubId,
      username: payload.username,
      email: payload.email,
      avatar_url: payload.avatarUrl,
      // New users get "admin" if their ID is whitelisted, "analyst" otherwise
      role: isAdmin ? "admin" : "analyst",
      last_login_at: new Date(),
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