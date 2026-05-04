import axios from "axios";

// ── Web OAuth App credentials ─────────────────────────────────────────────────
const GITHUB_CLIENT_ID     = process.env.GITHUB_CLIENT_ID     as string;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET as string;
const GITHUB_REDIRECT_URI  = process.env.GITHUB_REDIRECT_URI  as string;

// ── CLI OAuth App credentials (separate app, callback: http://localhost:9876/callback)
const CLI_GITHUB_CLIENT_ID     = process.env.CLI_GITHUB_CLIENT_ID     as string;
const CLI_GITHUB_CLIENT_SECRET = process.env.CLI_GITHUB_CLIENT_SECRET as string;

export interface GitHubUser {
  id: number;
  login: string;
  email: string | null;
  avatar_url: string;
  name: string | null;
}

interface GitHubTokenSuccess {
  error?: never;
  access_token: string;
  token_type: string;
  scope: string;
}

export interface GitHubTokenError {
  error: string;
  access_token?: never;
}

export type GitHubTokenResponse = GitHubTokenSuccess | GitHubTokenError;

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

export const buildAuthorizationUrl = (state: string, codeChallenge: string) => {
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: GITHUB_REDIRECT_URI,
    scope: "read:user user:email",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return `https://github.com/login/oauth/authorize?${params.toString()}`;
};

export const exchangeCodeForToken = async (
  code: string,
  codeVerifier: string,
  redirectUri?: string
): Promise<GitHubTokenResponse | null> => {
  // Use CLI OAuth App credentials when the request comes from the CLI
  // (identified by the localhost redirect_uri), otherwise use the web app credentials
  const isCLI = redirectUri?.includes("localhost");

  const clientId     = isCLI ? CLI_GITHUB_CLIENT_ID     : GITHUB_CLIENT_ID;
  const clientSecret = isCLI ? CLI_GITHUB_CLIENT_SECRET : GITHUB_CLIENT_SECRET;
  const finalRedirectUri = redirectUri ?? GITHUB_REDIRECT_URI;

  try {
    const { data } = await axios.post<GitHubTokenSuccess>(
      "https://github.com/login/oauth/access_token",
      {
        client_id:     clientId,
        client_secret: clientSecret,
        code,
        redirect_uri:  finalRedirectUri,
        code_verifier: codeVerifier,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      }
    );

    if ("error" in data && data.error) return { error: (data as unknown as GitHubTokenError).error };
    return data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const data = error.response?.data as { error_description?: string; error?: string } | undefined;
      console.error("Token exchange failed:", data);
      return { error: data?.error_description ?? data?.error ?? error.message };
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Token exchange failed:", message);
    return { error: message };
  }
};

export const fetchGitHubUser = async (accessToken: string): Promise<GitHubUser | null> => {
  try {
    const { data } = await axios.get<GitHubUser>("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    return data;
  } catch (error) {
    console.error("Failed to fetch GitHub user:", error);
    return null;
  }
};

export const fetchGitHubEmail = async (accessToken: string): Promise<string | null> => {
  try {
    const { data: emails } = await axios.get<GitHubEmail[]>(
      "https://api.github.com/user/emails",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    const primary = emails.find((e) => e.primary && e.verified);
    return primary?.email || emails[0]?.email || null;
  } catch (error) {
    console.error("Failed to fetch GitHub email:", error);
    return null;
  }
};