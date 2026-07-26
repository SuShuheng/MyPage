import Ajv from "ajv";
import type { MarketIndex, MarketManifest } from "./market-types";

export const marketManifestSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "id", "name", "description", "repository", "index"],
  properties: {
    schemaVersion: { const: 1 },
    id: { type: "string", pattern: "^[a-z0-9][a-z0-9._-]*$" },
    name: { type: "string", minLength: 1 },
    description: { type: "string" },
    repository: { type: "string", pattern: "^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$" },
    index: { const: ".mypage-market/index.json" },
  },
} as const;

export const marketIndexSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "generatedAt", "repository", "modules"],
  properties: {
    schemaVersion: { const: 1 },
    generatedAt: { type: "string", format: "date-time" },
    repository: { type: "string", pattern: "^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$" },
    modules: {
      type: "array",
      items: {
        type: "object",
        required: [
          "id",
          "name",
          "description",
          "author",
          "license",
          "path",
          "repository",
          "versions",
        ],
        properties: {
          id: { type: "string", pattern: "^[a-z0-9][a-z0-9._-]*$" },
          name: { type: "string", minLength: 1 },
          description: { type: "string" },
          author: { type: "string" },
          license: { type: "string" },
          path: { type: "string" },
          repository: { type: "string" },
          categories: {
            type: "array",
            uniqueItems: true,
            items: { type: "string" },
          },
          versions: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              required: [
                "version",
                "releaseTag",
                "downloadUrl",
                "sha256",
                "minMyPageVersion",
                "platforms",
                "permissions",
                "prerelease",
              ],
              properties: {
                version: { type: "string" },
                releaseTag: { type: "string" },
                downloadUrl: { type: "string", pattern: "^https://" },
                sha256: { type: "string", pattern: "^[a-fA-F0-9]{64}$" },
                minMyPageVersion: { type: "string" },
                maxMyPageVersion: { type: "string" },
                platforms: {
                  type: "array",
                  items: { enum: ["desktop", "mobile"] },
                },
                permissions: { type: "array" },
                prerelease: { type: "boolean" },
              },
            },
          },
        },
      },
    },
  },
} as const;

const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });
const validateManifest = ajv.compile<MarketManifest>(marketManifestSchema);
const validateIndex = ajv.compile<MarketIndex>(marketIndexSchema);

export function validateMarketManifest(value: unknown): value is MarketManifest {
  return validateManifest(value);
}

export function validateMarketIndex(value: unknown): value is MarketIndex {
  return validateIndex(value);
}

export function marketValidationErrors(): string[] {
  return [...(validateManifest.errors ?? []), ...(validateIndex.errors ?? [])].map(
    (error) => `${error.instancePath || "/"}: ${error.message ?? error.keyword}`,
  );
}
