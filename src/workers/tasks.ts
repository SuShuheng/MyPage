import Ajv from "ajv";
import { unzipSync } from "fflate";
import { executeQuery } from "../data/QueryCompiler";
import type {
  WorkerTaskPayloads,
  WorkerTaskResults,
  WorkerTaskType,
} from "./task-types";

export async function executeWorkerTask<T extends WorkerTaskType>(
  type: T,
  payload: WorkerTaskPayloads[T],
): Promise<WorkerTaskResults[T]> {
  switch (type) {
    case "query":
      return executeQuery(
        (payload as WorkerTaskPayloads["query"]).records,
        (payload as WorkerTaskPayloads["query"]).binding,
      ) as WorkerTaskResults[T];
    case "hash":
      return (await sha256(
        (payload as WorkerTaskPayloads["hash"]).data,
      )) as WorkerTaskResults[T];
    case "schema":
      return validateSchema(
        payload as WorkerTaskPayloads["schema"],
      ) as WorkerTaskResults[T];
    case "market-parse":
      return validateMarket(
        (payload as WorkerTaskPayloads["market-parse"]).value,
      ) as WorkerTaskResults[T];
    case "zip-inspect":
      return inspectZip(
        payload as WorkerTaskPayloads["zip-inspect"],
      ) as WorkerTaskResults[T];
  }
}

async function sha256(data: Uint8Array): Promise<string> {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function validateSchema({
  schema,
  value,
}: WorkerTaskPayloads["schema"]): WorkerTaskResults["schema"] {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  const valid = validate(value);
  return {
    valid: Boolean(valid),
    errors: (validate.errors ?? []).map(
      (error) => `${error.instancePath || "/"}: ${error.message ?? error.keyword}`,
    ),
  };
}

function validateMarket(value: unknown): WorkerTaskResults["market-parse"] {
  const errors: string[] = [];
  if (!isRecord(value)) errors.push("/: market index must be an object");
  const schemaVersion = isRecord(value) ? value.schemaVersion : undefined;
  const modules = isRecord(value) ? value.modules : undefined;
  if (schemaVersion !== 1) errors.push("/schemaVersion: must equal 1");
  if (!Array.isArray(modules)) {
    errors.push("/modules: must be an array");
  } else {
    const ids = new Set<string>();
    modules.forEach((module, index) => {
      if (!isRecord(module)) {
        errors.push(`/modules/${index}: must be an object`);
        return;
      }
      const id = module.id;
      if (typeof id !== "string" || !/^[a-z0-9][a-z0-9._-]*$/u.test(id)) {
        errors.push(`/modules/${index}/id: invalid module id`);
      } else if (ids.has(id)) {
        errors.push(`/modules/${index}/id: duplicate module id`);
      } else {
        ids.add(id);
      }
      if (!Array.isArray(module.versions) || module.versions.length === 0) {
        errors.push(`/modules/${index}/versions: must contain at least one version`);
      }
    });
  }
  return { valid: errors.length === 0, errors, value };
}

function inspectZip({
  data,
  limits,
}: WorkerTaskPayloads["zip-inspect"]): WorkerTaskResults["zip-inspect"] {
  const maxFiles = limits?.maxFiles ?? 256;
  const maxFileBytes = limits?.maxFileBytes ?? 10 * 1024 * 1024;
  const maxUncompressedBytes = limits?.maxUncompressedBytes ?? 25 * 1024 * 1024;
  const maxCompressionRatio = limits?.maxCompressionRatio ?? 100;
  const metadata = inspectCentralDirectory(data);
  if (metadata.length > maxFiles) {
    throw new Error(`ZIP contains ${metadata.length} files; maximum is ${maxFiles}.`);
  }
  let declaredTotal = 0;
  const names = new Set<string>();
  for (const entry of metadata) {
    validateZipPath(entry.path);
    if (names.has(entry.path)) throw new Error(`ZIP contains duplicate path: ${entry.path}`);
    names.add(entry.path);
    if (entry.uncompressedBytes > maxFileBytes) {
      throw new Error(`ZIP entry exceeds maximum file size: ${entry.path}`);
    }
    declaredTotal += entry.uncompressedBytes;
    if (declaredTotal > maxUncompressedBytes) {
      throw new Error("ZIP exceeds the maximum uncompressed size.");
    }
    const ratio =
      entry.compressedBytes === 0
        ? entry.uncompressedBytes === 0
          ? 1
          : Number.POSITIVE_INFINITY
        : entry.uncompressedBytes / entry.compressedBytes;
    if (ratio > maxCompressionRatio) {
      throw new Error(`ZIP entry exceeds compression ratio limit: ${entry.path}`);
    }
  }
  const files = unzipSync(data);
  const paths = Object.keys(files);
  if (paths.length > maxFiles) {
    throw new Error(`ZIP contains ${paths.length} files; maximum is ${maxFiles}.`);
  }
  let totalUncompressedBytes = 0;
  for (const [path, content] of Object.entries(files)) {
    validateZipPath(path);
    totalUncompressedBytes += content.byteLength;
    if (totalUncompressedBytes > maxUncompressedBytes) {
      throw new Error("ZIP exceeds the maximum uncompressed size.");
    }
  }
  return { files, totalUncompressedBytes };
}

function inspectCentralDirectory(
  data: Uint8Array,
): Array<{
  path: string;
  compressedBytes: number;
  uncompressedBytes: number;
}> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const decoder = new TextDecoder();
  const entries: Array<{
    path: string;
    compressedBytes: number;
    uncompressedBytes: number;
  }> = [];
  let endOffset = -1;
  const minimum = Math.max(0, data.byteLength - 65_557);
  for (let offset = data.byteLength - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error("ZIP end-of-central-directory is missing.");
  const entryCount = view.getUint16(endOffset + 10, true);
  const centralSize = view.getUint32(endOffset + 12, true);
  let offset = view.getUint32(endOffset + 16, true);
  if (
    entryCount === 0xffff ||
    centralSize === 0xffffffff ||
    offset === 0xffffffff
  ) {
    throw new Error("ZIP64 archives are not supported.");
  }
  if (offset + centralSize > endOffset) {
    throw new Error("ZIP central directory bounds are invalid.");
  }
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > data.byteLength || view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error("ZIP central directory is truncated.");
    }
    const compressedBytes = view.getUint32(offset + 20, true);
    const uncompressedBytes = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    if (end > data.byteLength) throw new Error("ZIP central directory is truncated.");
    const path = decoder.decode(data.subarray(offset + 46, offset + 46 + nameLength));
    entries.push({ path, compressedBytes, uncompressedBytes });
    offset = end;
  }
  if (offset > view.getUint32(endOffset + 16, true) + centralSize) {
    throw new Error("ZIP central directory size is invalid.");
  }
  return entries;
}

function validateZipPath(path: string): void {
  const normalized = path.replaceAll("\\", "/");
  if (
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//u.test(normalized) ||
    normalized.split("/").includes("..") ||
    normalized.includes("\0")
  ) {
    throw new Error(`Unsafe ZIP path: ${path}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
