import { requestUrl } from "obsidian";
import {
  assertGithubUrl,
  type GithubRequest,
} from "../core/github-fetch";

export const requestGithubWithObsidian: GithubRequest = async (
  input,
  init = {},
) => {
  const url = assertGithubUrl(input);
  if (init.body !== undefined && init.body !== null) {
    throw new Error("GitHub 请求桥当前只支持无请求体的请求。");
  }
  throwIfAborted(init.signal);
  const response = await waitForRequest(
    requestUrl({
      url: url.href,
      method: init.method ?? "GET",
      headers: headersToRecord(init.headers),
      throw: false,
    }),
    init.signal,
  );
  return new Response(response.arrayBuffer, {
    status: response.status,
    headers: response.headers,
  });
};

function headersToRecord(headers?: HeadersInit): Record<string, string> {
  const result: Record<string, string> = {};
  new Headers(headers).forEach((value, name) => {
    result[name] = value;
  });
  return result;
}

function throwIfAborted(signal?: AbortSignal | null): void {
  if (signal?.aborted) throw abortReason(signal);
}

async function waitForRequest<T>(
  request: Promise<T>,
  signal?: AbortSignal | null,
): Promise<T> {
  if (!signal) return request;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(abortReason(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    void request.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("GitHub 请求已取消。", "AbortError");
}
