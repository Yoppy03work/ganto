import "server-only";
import { graphql } from "@octokit/graphql";
import { requireUserGitHubAccessToken } from "./get-user-token";

/**
 * GitHub GraphQL client for ProjectV2 access.
 *
 * Per-user OAuth: each user runs their own GitHub OAuth flow at
 * /api/github/oauth/init and we store the resulting access_token in
 * `github_user_tokens` (ganto-managed table). When this user triggers a
 * sync we look up THEIR token — so they can only reach Projects they
 * personally have access to on GitHub.
 *
 * Throws `GitHubNotConnectedError` (412) if the user hasn't linked their
 * account yet.
 */
export async function getGithubClientForUser(actorId: string) {
  const token = await requireUserGitHubAccessToken(actorId);
  return graphql.defaults({
    headers: { authorization: `token ${token}` },
  });
}
