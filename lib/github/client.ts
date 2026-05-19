import "server-only";
import { graphql } from "@octokit/graphql";
import { requireUserGitHubAccessToken } from "./get-user-token";

/**
 * GitHub GraphQL client for ProjectV2 access.
 *
 * Per-user OAuth model: each user connects their own GitHub account via Neon
 * Auth's linkSocial flow (`/account` page). When this user triggers a sync,
 * Neon Auth resolves the access token (refreshing if expired) from the
 * current session — so they can only reach Projects they personally have
 * access to on GitHub. Throws `GitHubNotConnectedError` (412) if the user
 * hasn't linked their account yet.
 *
 * The `actorId` argument is preserved at the call site for clarity and audit
 * threading (we want every sync to record WHO did it), but token resolution
 * itself uses the request's session — not this id — so refresh stays correct.
 *
 * Replaces the old shared-PAT approach which leaked one operator's GitHub
 * permissions to every user of the app.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getGithubClientForUser(actorId: string) {
  const token = await requireUserGitHubAccessToken();
  return graphql.defaults({
    headers: { authorization: `token ${token}` },
  });
}
