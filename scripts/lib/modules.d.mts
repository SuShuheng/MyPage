export const REQUIRED_MODULE_FILES: readonly string[];

export function createModuleZip(directory: string): Promise<Uint8Array>;

export function normalizeModuleText(
  bytes: Uint8Array<ArrayBufferLike>,
): Uint8Array<ArrayBuffer>;

export function sha256(bytes: Uint8Array<ArrayBufferLike>): string;
