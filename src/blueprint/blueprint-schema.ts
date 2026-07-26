import Ajv from "ajv";
import type { DashboardBlueprint } from "./blueprint-types";

export const blueprintSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "kind",
    "name",
    "exportedAt",
    "dashboard",
    "groups",
    "widgets",
    "requiredModules",
  ],
  properties: {
    schemaVersion: { const: 1 },
    kind: { const: "mypage-blueprint" },
    name: { type: "string", minLength: 1 },
    description: { type: "string" },
    exportedAt: { type: "string" },
    dashboard: { type: "object" },
    groups: { type: "object" },
    widgets: { type: "object" },
    themeProfile: { type: "object" },
    requiredModules: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "versionRange"],
        properties: {
          id: { type: "string" },
          versionRange: { type: "string" },
          sourceId: { type: "string" },
        },
      },
    },
  },
} as const;

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile<DashboardBlueprint>(blueprintSchema);

export function validateBlueprint(value: unknown): value is DashboardBlueprint {
  return validate(value);
}

export function blueprintErrors(): string[] {
  return (validate.errors ?? []).map(
    (error) => `${error.instancePath || "/"}: ${error.message ?? error.keyword}`,
  );
}
