import "server-only";
import { graphql } from "@octokit/graphql";

/**
 * GitHub GraphQL client for ProjectV2 access.
 *
 * For the hackathon we use a single shared GITHUB_PAT (server env var). In a
 * production multi-user app this would be a per-user token stored encrypted.
 */
export function getGithubClient() {
  const token = process.env.GITHUB_PAT;
  if (!token) {
    throw new Error("GITHUB_PAT is not set in .env.local");
  }
  return graphql.defaults({
    headers: { authorization: `token ${token}` },
  });
}
