export class MyPageError extends Error {
  public constructor(
    message: string,
    public readonly code: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = "MyPageError";
    if (cause !== undefined) {
      Object.defineProperty(this, "cause", {
        configurable: true,
        enumerable: false,
        value: cause,
        writable: true,
      });
    }
  }
}

export class SettingsValidationError extends MyPageError {
  public constructor(
    message: string,
    public readonly validationErrors: readonly string[],
    cause?: unknown,
  ) {
    super(message, "SETTINGS_VALIDATION_FAILED", cause);
    this.name = "SettingsValidationError";
  }
}

export class StaleRevisionError extends MyPageError {
  public constructor(expected: number, actual: number) {
    super(
      `Settings revision is stale: expected ${expected}, current ${actual}.`,
      "STALE_REVISION",
    );
    this.name = "StaleRevisionError";
  }
}
