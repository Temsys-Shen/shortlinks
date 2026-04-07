import type { ShortLinkListResponse, ShortLinkRecord } from "../types";

const API_BASE = "/api";

interface ErrorResponse {
  error: string;
  message: string;
}

interface RequestOptions {
  method: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  apiKey?: string;
}

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function requestJson<T>(path: string, options: RequestOptions): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }
  if (options.apiKey) {
    headers["x-api-key"] = options.apiKey;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const parsed = (await response.json()) as T | ErrorResponse;

  if (!response.ok) {
    const errorPayload = parsed as ErrorResponse;
    throw new ApiError(response.status, errorPayload.error, errorPayload.message);
  }

  return parsed as T;
}

export async function createShortLink(input: {
  url: string;
  code?: string;
}): Promise<ShortLinkRecord> {
  return requestJson<ShortLinkRecord>("/shortlinks", {
    method: "POST",
    body: input,
  });
}

export async function listShortLinks(limit = 100): Promise<ShortLinkListResponse> {
  return requestJson<ShortLinkListResponse>(`/shortlinks?limit=${limit}`, {
    method: "GET",
  });
}

export async function getShortLinkByCode(code: string): Promise<ShortLinkRecord> {
  return requestJson<ShortLinkRecord>(`/shortlinks/${encodeURIComponent(code)}`, {
    method: "GET",
  });
}

export async function updateShortLink(
  code: string,
  input: {
    newUrl?: string;
    newCode?: string;
  },
  apiKey: string,
): Promise<ShortLinkRecord> {
  return requestJson<ShortLinkRecord>(`/shortlinks/${encodeURIComponent(code)}`, {
    method: "PUT",
    body: input,
    apiKey,
  });
}

export async function deleteShortLink(code: string, apiKey: string): Promise<{ deleted: boolean }> {
  return requestJson<{ deleted: boolean }>(`/shortlinks/${encodeURIComponent(code)}`, {
    method: "DELETE",
    apiKey,
  });
}
