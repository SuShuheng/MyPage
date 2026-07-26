import Ajv from "ajv";
import type { ModuleManifest } from "./module-types";

export const moduleManifestSchema = {
  $id: "https://github.com/SuShuHeng/MyPage/schemas/module-manifest-v1.json",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "id",
    "name",
    "version",
    "description",
    "author",
    "license",
    "minMyPageVersion",
    "platforms",
    "entry",
    "styles",
    "configSchema",
    "trust",
    "permissions",
    "contributions",
  ],
  properties: {
    schemaVersion: { const: 1 },
    id: { type: "string", pattern: "^[a-z0-9][a-z0-9._-]*$" },
    name: { type: "string", minLength: 1, maxLength: 80 },
    version: {
      type: "string",
      pattern: "^[0-9]+\\.[0-9]+\\.[0-9]+(?:-[0-9A-Za-z.-]+)?$",
    },
    description: { type: "string", maxLength: 500 },
    author: { type: "string", minLength: 1 },
    license: { type: "string", minLength: 1 },
    minMyPageVersion: { type: "string", minLength: 1 },
    maxMyPageVersion: { type: "string" },
    platforms: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: { enum: ["desktop", "mobile"] },
    },
    entry: { const: "main.js" },
    styles: { const: "styles.css" },
    configSchema: { const: "config.schema.json" },
    trust: { enum: ["sandbox", "trusted"] },
    permissions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["capability", "reason"],
        properties: {
          capability: {
            enum: [
              "vault.read",
              "vault.write",
              "network.request",
              "externalFs.read",
              "externalFs.write",
              "git.read",
              "git.write",
              "obsidian.command",
              "system.exec",
            ],
          },
          reason: { type: "string", minLength: 1 },
          suggestedScope: { type: "object" },
        },
      },
    },
    contributions: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "kind", "name"],
        properties: {
          id: { type: "string", pattern: "^[a-z0-9][a-z0-9._-]*$" },
          kind: {
            enum: [
              "widget",
              "dataSource",
              "transform",
              "action",
              "dashboardTemplate",
              "settings",
            ],
          },
          name: { type: "string", minLength: 1 },
          description: { type: "string" },
          icon: { type: "string" },
          entry: { type: "string" },
          defaultSize: {
            type: "object",
            required: ["w", "h"],
            properties: {
              w: { type: "integer", minimum: 1, maximum: 12 },
              h: { type: "integer", minimum: 1, maximum: 20 },
            },
          },
          configSchema: { type: "string" },
        },
      },
    },
  },
} as const;

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile<ModuleManifest>(moduleManifestSchema);

export function validateModuleManifest(value: unknown): value is ModuleManifest {
  return validate(value);
}

export function moduleManifestErrors(): string[] {
  return (validate.errors ?? []).map(
    (error) => `${error.instancePath || "/"}: ${error.message ?? error.keyword}`,
  );
}
