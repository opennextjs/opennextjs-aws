import type http from "node:http";

export const parseHeaders = (
  headers?: http.OutgoingHttpHeader[] | http.OutgoingHttpHeaders,
) => {
  const result: Record<string, string> = {};
  if (!headers) {
    return result;
  }

  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) {
      continue;
    } else {
      result[key.toLowerCase()] = convertHeader(value);
    }
  }

  return result;
};

export const convertHeader = (header: http.OutgoingHttpHeader) => {
  if (typeof header === "string") {
    return header;
  } else if (Array.isArray(header)) {
    return header.join(",");
  } else {
    return String(header);
  }
};

export function parseCookies(
  cookies: string | string[] | null | undefined,
): string[] {
  if (cookies == null) {
    return [];
  }

  return typeof cookies === "string"
    ? cookies.split(/(?<!Expires=\w+),/i).map((c) => c.trim())
    : cookies;
}
