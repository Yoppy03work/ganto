import "server-only";
import { getGithubClient } from "./client";

/**
 * Fetch a ProjectV2's items + field values, trying user(login) first and
 * falling back to organization(login) — matches our "auto-detect owner type"
 * decision.
 */

type ProjectV2FieldNode = {
  __typename: string;
  id: string;
  name: string;
  options?: { id: string; name: string }[];
};

type ProjectFieldValueNode = {
  __typename: string;
  field?: { id: string; name: string };
  text?: string;
  date?: string;
  number?: number;
  name?: string; // single-select option name
  optionId?: string;
  iterationId?: string;
};

type ProjectItemNode = {
  id: string;
  isArchived: boolean;
  type: "DRAFT_ISSUE" | "ISSUE" | "PULL_REQUEST" | "REDACTED";
  content?: {
    __typename: string;
    title?: string;
    body?: string;
    url?: string;
    number?: number;
    state?: string;
  } | null;
  fieldValues: { nodes: ProjectFieldValueNode[] };
};

type ProjectFetchResult = {
  ownerType: "user" | "organization";
  projectId: string;
  fields: ProjectV2FieldNode[];
  items: ProjectItemNode[];
};

const PROJECT_QUERY_USER = /* GraphQL */ `
  query ($login: String!, $number: Int!) {
    user(login: $login) {
      projectV2(number: $number) {
        id
        fields(first: 50) {
          nodes {
            ... on ProjectV2Field {
              __typename
              id
              name
            }
            ... on ProjectV2SingleSelectField {
              __typename
              id
              name
              options { id name }
            }
            ... on ProjectV2IterationField {
              __typename
              id
              name
            }
          }
        }
        items(first: 100) {
          nodes {
            id
            isArchived
            type
            content {
              __typename
              ... on DraftIssue { title body }
              ... on Issue { title body url number state }
              ... on PullRequest { title body url number state }
            }
            fieldValues(first: 50) {
              nodes {
                ... on ProjectV2ItemFieldTextValue {
                  __typename text field { ... on ProjectV2FieldCommon { id name } }
                }
                ... on ProjectV2ItemFieldDateValue {
                  __typename date field { ... on ProjectV2FieldCommon { id name } }
                }
                ... on ProjectV2ItemFieldNumberValue {
                  __typename number field { ... on ProjectV2FieldCommon { id name } }
                }
                ... on ProjectV2ItemFieldSingleSelectValue {
                  __typename name optionId field { ... on ProjectV2FieldCommon { id name } }
                }
              }
            }
          }
        }
      }
    }
  }
`;

const PROJECT_QUERY_ORG = PROJECT_QUERY_USER.replace("user(login:", "organization(login:");

export async function fetchProjectV2(opts: {
  owner: string;
  number: number;
}): Promise<ProjectFetchResult | null> {
  const client = getGithubClient();
  // Try user first, then organization.
  type Resp = {
    user?: { projectV2: ProjectFetchResult | null };
    organization?: { projectV2: ProjectFetchResult | null };
  };
  let resp: Resp;
  try {
    resp = await client<Resp>(PROJECT_QUERY_USER, {
      login: opts.owner,
      number: opts.number,
    });
  } catch {
    resp = {};
  }
  let p = resp.user?.projectV2 ?? null;
  let ownerType: "user" | "organization" = "user";
  if (!p) {
    try {
      resp = await client<Resp>(PROJECT_QUERY_ORG, {
        login: opts.owner,
        number: opts.number,
      });
    } catch {
      resp = {};
    }
    p = resp.organization?.projectV2 ?? null;
    ownerType = "organization";
  }
  if (!p) return null;

  // The query returns a `ProjectV2` shape; we re-shape to ProjectFetchResult.
  // Using `unknown` cast is fine — the GraphQL response matches our types.
  const project = p as unknown as {
    id: string;
    fields: { nodes: ProjectV2FieldNode[] };
    items: { nodes: ProjectItemNode[] };
  };

  return {
    ownerType,
    projectId: project.id,
    fields: project.fields.nodes,
    items: project.items.nodes,
  };
}
