import type {
  CapabilityId,
  PermissionGrant,
  PermissionScope,
} from "../persistence/settings-types";

export interface CapabilityRequestContext {
  path?: string;
  domain?: string;
  repository?: string;
  command?: string;
  executable?: string;
}

export function grantMatches(
  grant: PermissionGrant,
  moduleId: string,
  moduleVersion: string,
  capability: CapabilityId,
  vaultId: string,
  deviceId: string,
  request: CapabilityRequestContext,
): boolean {
  return (
    grant.moduleId === moduleId &&
    grant.moduleVersion === moduleVersion &&
    grant.capability === capability &&
    grant.vaultId === vaultId &&
    grant.deviceId === deviceId &&
    scopeMatches(grant.scope, request)
  );
}

export function scopeMatches(
  scope: PermissionScope,
  request: CapabilityRequestContext,
): boolean {
  if (request.path !== undefined) {
    if (!scope.paths?.some((root) => pathWithin(request.path ?? "", root))) return false;
  }
  if (request.domain !== undefined) {
    if (!scope.domains?.some((allowed) => domainMatches(request.domain ?? "", allowed))) {
      return false;
    }
  }
  if (request.repository !== undefined) {
    if (!scope.repositories?.some((allowed) => samePath(request.repository ?? "", allowed))) {
      return false;
    }
  }
  if (request.command !== undefined && !scope.commands?.includes(request.command)) {
    return false;
  }
  if (
    request.executable !== undefined &&
    !scope.executables?.some((allowed) => samePath(request.executable ?? "", allowed))
  ) {
    return false;
  }
  return true;
}

export function pathWithin(path: string, root: string): boolean {
  let normalizedPath = normalizePath(path);
  let normalizedRoot = normalizePath(root).replace(/\/$/u, "");
  if (
    normalizedPath.split("/").includes("..") ||
    normalizedRoot.split("/").includes("..") ||
    normalizedPath.includes("\0") ||
    normalizedRoot.includes("\0")
  ) {
    return false;
  }
  if (isWindowsPath(normalizedPath) && isWindowsPath(normalizedRoot)) {
    normalizedPath = normalizedPath.toLocaleLowerCase();
    normalizedRoot = normalizedRoot.toLocaleLowerCase();
  }
  return (
    normalizedPath === normalizedRoot ||
    normalizedPath.startsWith(`${normalizedRoot}/`)
  );
}

function isWindowsPath(path: string): boolean {
  return /^[A-Za-z]:\//u.test(path) || path.startsWith("//");
}

export function domainMatches(requested: string, allowed: string): boolean {
  try {
    const requestedUrl = new URL(ensureProtocol(requested));
    const allowedUrl = new URL(ensureProtocol(allowed));
    return (
      requestedUrl.protocol === allowedUrl.protocol &&
      requestedUrl.hostname.toLocaleLowerCase() ===
        allowedUrl.hostname.toLocaleLowerCase() &&
      effectivePort(requestedUrl) === effectivePort(allowedUrl)
    );
  } catch {
    return false;
  }
}

function ensureProtocol(value: string): string {
  return /^[a-z][a-z0-9+.-]*:\/\//iu.test(value) ? value : `https://${value}`;
}

function effectivePort(url: URL): string {
  if (url.port) return url.port;
  return url.protocol === "https:" ? "443" : url.protocol === "http:" ? "80" : "";
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/\/+/gu, "/").replace(/\/$/u, "");
}

function samePath(left: string, right: string): boolean {
  return normalizePath(left).toLocaleLowerCase() === normalizePath(right).toLocaleLowerCase();
}
