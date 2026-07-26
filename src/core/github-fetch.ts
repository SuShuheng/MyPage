const ALLOWED_GITHUB_HOSTS = new Set([
  "github.com",
  "api.github.com",
  "raw.githubusercontent.com",
  "objects.githubusercontent.com",
  "github-releases.githubusercontent.com",
]);

export function assertGithubUrl(value: string | URL): URL {
  const url = value instanceof URL ? value : new URL(value);
  const hostname = url.hostname.toLocaleLowerCase();
  if (
    url.protocol !== "https:" ||
    (!ALLOWED_GITHUB_HOSTS.has(hostname) &&
      !hostname.endsWith(".githubusercontent.com"))
  ) {
    throw new Error(`不允许的 GitHub 资源地址：${url.origin}`);
  }
  return url;
}

export type GithubRequest = (
  input: string | URL,
  init?: RequestInit,
  maximumRedirects?: number,
) => Promise<Response>;

export async function fetchGithub(
  input: string | URL,
  init: RequestInit = {},
  maximumRedirects = 3,
): Promise<Response> {
  let url = assertGithubUrl(input);
  for (let redirects = 0; ; redirects += 1) {
    const response = await fetch(url, { ...init, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    if (redirects >= maximumRedirects) {
      throw new Error("GitHub 资源重定向次数过多。");
    }
    const location = response.headers.get("location");
    if (!location) throw new Error("GitHub 重定向缺少 Location。");
    url = assertGithubUrl(new URL(location, url));
  }
}
