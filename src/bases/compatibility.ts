export interface BasesCompatibilityIssue {
  path: string;
  severity: "warning" | "error";
  message: string;
}

export interface BasesCompatibilityReport {
  supported: boolean;
  issues: BasesCompatibilityIssue[];
}

export const SUPPORTED_BASES_FEATURES = [
  "folder and file extension scope",
  "simple property comparisons",
  "contains and exists filters",
  "ascending and descending sort",
  "result limit",
  "safe MyPage-compatible formulas",
] as const;
