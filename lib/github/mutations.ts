import "server-only";
import { getGithubClient } from "./client";

/**
 * Create a Draft Issue inside a ProjectV2 and return the new item ID.
 */
export async function addDraftIssue(opts: {
  projectId: string;
  title: string;
  body?: string;
}): Promise<string> {
  const client = getGithubClient();
  const ADD = /* GraphQL */ `
    mutation ($projectId: ID!, $title: String!, $body: String) {
      addProjectV2DraftIssue(input: {
        projectId: $projectId
        title: $title
        body: $body
      }) {
        projectItem { id }
      }
    }
  `;
  type Resp = {
    addProjectV2DraftIssue: { projectItem: { id: string } };
  };
  const resp = await client<Resp>(ADD, {
    projectId: opts.projectId,
    title: opts.title,
    body: opts.body ?? null,
  });
  return resp.addProjectV2DraftIssue.projectItem.id;
}

export type FieldValue =
  | { date: string } // ISO yyyy-mm-dd
  | { text: string }
  | { number: number }
  | { singleSelectOptionId: string };

/**
 * Update a single field on a ProjectV2 item. The `value` shape mirrors the
 * GraphQL `ProjectV2FieldValue` input union.
 */
export async function updateItemField(opts: {
  projectId: string;
  itemId: string;
  fieldId: string;
  value: FieldValue;
}): Promise<void> {
  const client = getGithubClient();
  const UPDATE = /* GraphQL */ `
    mutation (
      $projectId: ID!
      $itemId: ID!
      $fieldId: ID!
      $value: ProjectV2FieldValue!
    ) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $projectId
        itemId: $itemId
        fieldId: $fieldId
        value: $value
      }) {
        projectV2Item { id }
      }
    }
  `;
  await client(UPDATE, {
    projectId: opts.projectId,
    itemId: opts.itemId,
    fieldId: opts.fieldId,
    value: opts.value,
  });
}
