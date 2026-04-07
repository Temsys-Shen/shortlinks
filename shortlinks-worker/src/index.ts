interface Env {
  shortlinks: KVNamespace;
  API_KEY: string;
}

interface ShortLinkRecord {
  code: string;
  url: string;
  createdAt: string;
  updatedAt: string;
}

class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
};

const CODE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const SHORTLINK_PATH_PATTERN = /^\/([A-Za-z0-9_-]{1,64})$/;
const LINK_KEY_PREFIX = "link:";
const URL_KEY_PREFIX = "url:";
const LIST_LIMIT_DEFAULT = 100;
const LIST_LIMIT_MAX = 100;
const AUTO_CODE_LENGTH = 6;
const AUTO_CODE_MAX_ATTEMPTS = 5;
const AUTO_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const RESERVED_REDIRECT_PATHS = new Set(["api", "admin", "shortlinks"]);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const { pathname, searchParams } = new URL(request.url);
      const normalizedPath = normalizePath(pathname);
      const method = request.method.toUpperCase();

      if (method === "POST" && normalizedPath === "/shortlinks") {
        return createShortLink(request, env);
      }

      if (method === "GET" && normalizedPath === "/shortlinks") {
        const code = searchParams.get("code");
        if (code) {
          return getOneShortLink(code, env);
        }
        return listShortLinks(searchParams, env);
      }

      const shortCodeMatch = normalizedPath.match(SHORTLINK_PATH_PATTERN);
      if ((method === "GET" || method === "HEAD") && shortCodeMatch) {
        const code = shortCodeMatch[1];
        if (!RESERVED_REDIRECT_PATHS.has(code)) {
          return redirectByCode(code, env, method === "HEAD");
        }
      }

      const codeMatch = normalizedPath.match(/^\/shortlinks\/([A-Za-z0-9_-]{1,64})$/);
      if (!codeMatch) {
        return json(
          { error: "NOT_FOUND", message: "Route not found" },
          404,
        );
      }

      const code = codeMatch[1];

      if (method === "GET") {
        return getOneShortLink(code, env);
      }

      if (method === "PUT") {
        const authResult = ensureAdmin(request, env);
        if (authResult) {
          return authResult;
        }
        return updateShortLink(request, code, env);
      }

      if (method === "DELETE") {
        const authResult = ensureAdmin(request, env);
        if (authResult) {
          return authResult;
        }
        return deleteShortLink(code, env);
      }

      return json(
        {
          error: "METHOD_NOT_ALLOWED",
          message: `Method ${method} is not allowed for this route`,
        },
        405,
      );
    } catch (error) {
      if (error instanceof HttpError) {
        return json(
          {
            error: error.code,
            message: error.message,
          },
          error.status,
        );
      }

      const message = error instanceof Error ? error.message : "Unknown error";
      return json(
        {
          error: "INTERNAL_ERROR",
          message,
        },
        500,
      );
    }
  },
};

function normalizePath(pathname: string): string {
  if (pathname === "/api" || pathname === "/api/") {
    return "/";
  }
  if (pathname.startsWith("/api/")) {
    return pathname.slice(4);
  }
  return pathname;
}

async function createShortLink(request: Request, env: Env): Promise<Response> {
  const body = await parseJsonBody<{ code?: string; url?: string }>(request);
  if (!body.url) {
    return json(
      {
        error: "VALIDATION_ERROR",
        message: "Request body must include url",
      },
      400,
    );
  }

  const normalizedUrl = normalizeHttpUrl(body.url);
  if (!normalizedUrl) {
    return json(
      {
        error: "VALIDATION_ERROR",
        message: "url must be a valid http or https URL",
      },
      400,
    );
  }

  const existingByUrl = await getShortLinkByUrl(normalizedUrl, env);
  if (existingByUrl !== null) {
    return json(existingByUrl, 200);
  }

  let code = body.code?.trim();
  if (code) {
    if (!isValidCode(code)) {
      return json(
        {
          error: "VALIDATION_ERROR",
          message: "code must match /^[A-Za-z0-9_-]{1,64}$/",
        },
        400,
      );
    }
  } else {
    code = await generateAvailableCode(env);
  }

  const existingByCode = await getShortLinkByCode(code, env);
  if (existingByCode !== null) {
    return json(
      {
        error: "CONFLICT",
        message: `Short link code '${code}' already exists`,
      },
      409,
    );
  }

  const now = new Date().toISOString();
  const record: ShortLinkRecord = {
    code,
    url: normalizedUrl,
    createdAt: now,
    updatedAt: now,
  };

  await putShortLinkRecord(record, env);
  await putUrlIndex(normalizedUrl, code, env);

  return json(record, 201);
}

async function getOneShortLink(codeRaw: string, env: Env): Promise<Response> {
  const code = codeRaw.trim();
  if (!isValidCode(code)) {
    return json(
      {
        error: "VALIDATION_ERROR",
        message: "code must match /^[A-Za-z0-9_-]{1,64}$/",
      },
      400,
    );
  }

  const record = await getShortLinkByCode(code, env);
  if (record === null) {
    return json(
      {
        error: "NOT_FOUND",
        message: `Short link code '${code}' does not exist`,
      },
      404,
    );
  }

  return json(record, 200);
}

async function redirectByCode(codeRaw: string, env: Env, isHead: boolean): Promise<Response> {
  const code = codeRaw.trim();
  if (!isValidCode(code)) {
    return json(
      {
        error: "VALIDATION_ERROR",
        message: "code must match /^[A-Za-z0-9_-]{1,64}$/",
      },
      400,
    );
  }

  const record = await getShortLinkByCode(code, env);
  if (record === null) {
    return json(
      {
        error: "NOT_FOUND",
        message: `Short link code '${code}' does not exist`,
      },
      404,
    );
  }

  const headers = new Headers({
    location: record.url,
    "cache-control": "no-store",
  });

  return new Response(isHead ? null : "", {
    status: 302,
    headers,
  });
}

async function listShortLinks(searchParams: URLSearchParams, env: Env): Promise<Response> {
  const limitRaw = searchParams.get("limit");

  let limit = LIST_LIMIT_DEFAULT;
  if (limitRaw !== null) {
    const parsed = Number(limitRaw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > LIST_LIMIT_MAX) {
      return json(
        {
          error: "VALIDATION_ERROR",
          message: `limit must be an integer between 1 and ${LIST_LIMIT_MAX}`,
        },
        400,
      );
    }
    limit = parsed;
  }

  const listed = await env.shortlinks.list({
    prefix: LINK_KEY_PREFIX,
    limit,
  });

  const records = await Promise.all(
    listed.keys.map(async (key) => {
      const raw = await env.shortlinks.get(key.name);
      if (raw === null) {
        throw new Error(`KV key '${key.name}' listed but value is missing`);
      }
      const parsed = JSON.parse(raw) as ShortLinkRecord;
      return parsed;
    }),
  );

  return json(
    {
      items: records,
      cursor: listed.cursor,
      list_complete: listed.list_complete,
    },
    200,
  );
}

async function updateShortLink(request: Request, codeRaw: string, env: Env): Promise<Response> {
  const oldCode = codeRaw.trim();
  if (!isValidCode(oldCode)) {
    return json(
      {
        error: "VALIDATION_ERROR",
        message: "code must match /^[A-Za-z0-9_-]{1,64}$/",
      },
      400,
    );
  }

  const existingRecord = await getShortLinkByCode(oldCode, env);
  if (existingRecord === null) {
    return json(
      {
        error: "NOT_FOUND",
        message: `Short link code '${oldCode}' does not exist`,
      },
      404,
    );
  }

  const body = await parseJsonBody<{ newUrl?: string; newCode?: string }>(request);
  if (body.newUrl === undefined && body.newCode === undefined) {
    return json(
      {
        error: "VALIDATION_ERROR",
        message: "Request body must include at least one of newUrl or newCode",
      },
      400,
    );
  }

  let targetUrl = existingRecord.url;
  if (body.newUrl !== undefined) {
    const normalizedTargetUrl = normalizeHttpUrl(body.newUrl);
    if (!normalizedTargetUrl) {
      return json(
        {
          error: "VALIDATION_ERROR",
          message: "newUrl must be a valid http or https URL",
        },
        400,
      );
    }
    targetUrl = normalizedTargetUrl;
  }

  let targetCode = oldCode;
  if (body.newCode !== undefined) {
    const trimmedCode = body.newCode.trim();
    if (!isValidCode(trimmedCode)) {
      return json(
        {
          error: "VALIDATION_ERROR",
          message: "newCode must match /^[A-Za-z0-9_-]{1,64}$/",
        },
        400,
      );
    }
    targetCode = trimmedCode;
  }

  const existingByTargetUrl = await getShortLinkByUrl(targetUrl, env);
  if (existingByTargetUrl !== null && existingByTargetUrl.code !== oldCode) {
    await deleteUrlIndex(existingRecord.url, oldCode, env);
    await deleteShortLinkRecord(oldCode, env);
    return json(existingByTargetUrl, 200);
  }

  if (targetCode !== oldCode) {
    const existingByTargetCode = await getShortLinkByCode(targetCode, env);
    if (existingByTargetCode !== null) {
      return json(
        {
          error: "CONFLICT",
          message: `Short link code '${targetCode}' already exists`,
        },
        409,
      );
    }
  }

  const updatedRecord: ShortLinkRecord = {
    code: targetCode,
    url: targetUrl,
    createdAt: existingRecord.createdAt,
    updatedAt: new Date().toISOString(),
  };

  await putShortLinkRecord(updatedRecord, env);
  await putUrlIndex(targetUrl, targetCode, env);

  if (targetCode !== oldCode) {
    await deleteShortLinkRecord(oldCode, env);
  }

  if (targetUrl !== existingRecord.url) {
    await deleteUrlIndex(existingRecord.url, oldCode, env);
  }

  return json(updatedRecord, 200);
}

async function deleteShortLink(codeRaw: string, env: Env): Promise<Response> {
  const code = codeRaw.trim();
  if (!isValidCode(code)) {
    return json(
      {
        error: "VALIDATION_ERROR",
        message: "code must match /^[A-Za-z0-9_-]{1,64}$/",
      },
      400,
    );
  }

  const existingRecord = await getShortLinkByCode(code, env);
  if (existingRecord === null) {
    return json(
      {
        error: "NOT_FOUND",
        message: `Short link code '${code}' does not exist`,
      },
      404,
    );
  }

  await deleteUrlIndex(existingRecord.url, code, env);
  await deleteShortLinkRecord(code, env);

  return json(
    {
      code,
      deleted: true,
    },
    200,
  );
}

function ensureAdmin(request: Request, env: Env): Response | null {
  if (!env.API_KEY) {
    return json(
      {
        error: "SERVER_CONFIG_ERROR",
        message: "API_KEY is not configured",
      },
      500,
    );
  }

  const provided = request.headers.get("x-api-key");
  if (!provided) {
    return json(
      {
        error: "UNAUTHORIZED",
        message: "Missing x-api-key header",
      },
      401,
    );
  }

  if (provided !== env.API_KEY) {
    return json(
      {
        error: "UNAUTHORIZED",
        message: "Invalid API key",
      },
      401,
    );
  }

  return null;
}

async function parseJsonBody<T>(request: Request): Promise<T> {
  const text = await request.text();
  if (!text) {
    throw new HttpError(400, "BAD_REQUEST", "Request body is empty");
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, "BAD_REQUEST", "Request body is not valid JSON");
  }
}

function isValidCode(code: string): boolean {
  return CODE_PATTERN.test(code);
}

function normalizeHttpUrl(urlRaw: string): string | null {
  const trimmed = urlRaw.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

async function getShortLinkByCode(code: string, env: Env): Promise<ShortLinkRecord | null> {
  const raw = await env.shortlinks.get(toLinkKey(code));
  if (raw === null) {
    return null;
  }
  return JSON.parse(raw) as ShortLinkRecord;
}

async function getShortLinkByUrl(url: string, env: Env): Promise<ShortLinkRecord | null> {
  const indexedCode = await getCodeByUrl(url, env);
  if (indexedCode === null) {
    return null;
  }

  const record = await getShortLinkByCode(indexedCode, env);
  if (record === null) {
    throw new Error(`URL index points to missing code '${indexedCode}'`);
  }

  return record;
}

async function putShortLinkRecord(record: ShortLinkRecord, env: Env): Promise<void> {
  await env.shortlinks.put(toLinkKey(record.code), JSON.stringify(record));
}

async function deleteShortLinkRecord(code: string, env: Env): Promise<void> {
  await env.shortlinks.delete(toLinkKey(code));
}

async function putUrlIndex(url: string, code: string, env: Env): Promise<void> {
  const indexKey = await toUrlIndexKey(url);
  await env.shortlinks.put(indexKey, code);
}

async function getCodeByUrl(url: string, env: Env): Promise<string | null> {
  const indexKey = await toUrlIndexKey(url);
  return env.shortlinks.get(indexKey);
}

async function deleteUrlIndex(url: string, expectedCode: string, env: Env): Promise<void> {
  const indexKey = await toUrlIndexKey(url);
  const indexedCode = await env.shortlinks.get(indexKey);
  if (indexedCode === null) {
    throw new Error(`URL index '${indexKey}' does not exist`);
  }
  if (indexedCode !== expectedCode) {
    throw new Error(
      `URL index '${indexKey}' points to '${indexedCode}' instead of '${expectedCode}'`,
    );
  }
  await env.shortlinks.delete(indexKey);
}

function toLinkKey(code: string): string {
  return `${LINK_KEY_PREFIX}${code}`;
}

async function toUrlIndexKey(normalizedUrl: string): Promise<string> {
  const hash = await sha256Hex(normalizedUrl);
  return `${URL_KEY_PREFIX}${hash}`;
}

async function sha256Hex(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function generateAvailableCode(env: Env): Promise<string> {
  for (let attempt = 0; attempt < AUTO_CODE_MAX_ATTEMPTS; attempt += 1) {
    const candidate = generateRandomCode(AUTO_CODE_LENGTH);
    const existing = await getShortLinkByCode(candidate, env);
    if (existing === null) {
      return candidate;
    }
  }

  throw new HttpError(
    503,
    "CODE_GENERATION_FAILED",
    `Unable to allocate code after ${AUTO_CODE_MAX_ATTEMPTS} attempts`,
  );
}

function generateRandomCode(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += AUTO_CODE_ALPHABET[bytes[i] % AUTO_CODE_ALPHABET.length];
  }
  return code;
}
