import "server-only";
import { graphql } from "@octokit/graphql";
import { requireUserGitHubAccessToken } from "./get-user-token";

/**
 * GitHub GraphQL client for ProjectV2 access.
 *
 * Per-user OAuth model: each user connects their own GitHub account via
 * Neon Auth's linkSocial flow (`/account` page). When this user triggers a
 * sync, we use THEIR access token — so they can only reach Projects they
 * personally have access to on GitHub. Throws `GitHubNotConnectedError`
 * (412) if the user hasn't linked their account yet.
 *
 * Replaces the old shared-PAT approach which leaked one operator's GitHub
 * permissions to every user of the app.
 */
export async function getGithubClientForUser(userId: string) {
  const token = await requireUserGitHubAccessToken(userId);
  return graphql.defaults({
    headers: { authorization: `token ${token}` },
  });
}
