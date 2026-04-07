import { FormEvent, useEffect, useMemo, useState } from "react";
import { ApiError, deleteShortLink, listShortLinks, updateShortLink } from "../lib/api";
import type { ShortLinkRecord } from "../types";

const ADMIN_KEY_STORAGE = "shortlinks_admin_api_key";

interface DraftState {
  code: string;
  url: string;
}

export function AdminPage(): JSX.Element {
  const [records, setRecords] = useState<ShortLinkRecord[]>([]);
  const [draftMap, setDraftMap] = useState<Record<string, DraftState>>({});
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem(ADMIN_KEY_STORAGE) ?? "");
  const [loading, setLoading] = useState(false);
  const [runningCode, setRunningCode] = useState<string>("");
  const [error, setError] = useState<string>("");

  async function loadList(): Promise<void> {
    setLoading(true);
    setError("");
    try {
      const response = await listShortLinks(100);
      setRecords(response.items);
      const nextDraftMap: Record<string, DraftState> = {};
      for (const item of response.items) {
        nextDraftMap[item.code] = { code: item.code, url: item.url };
      }
      setDraftMap(nextDraftMap);
    } catch (loadError) {
      setError(toErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadList();
  }, []);

  const hasData = useMemo(() => records.length > 0, [records]);

  function persistApiKey(next: string): void {
    setApiKey(next);
    localStorage.setItem(ADMIN_KEY_STORAGE, next);
  }

  function clearApiKey(): void {
    setApiKey("");
    localStorage.removeItem(ADMIN_KEY_STORAGE);
  }

  function updateDraft(oldCode: string, patch: Partial<DraftState>): void {
    setDraftMap((prev) => ({
      ...prev,
      [oldCode]: {
        ...prev[oldCode],
        ...patch,
      },
    }));
  }

  async function handleSave(record: ShortLinkRecord): Promise<void> {
    if (!apiKey.trim()) {
      setError("UNAUTHORIZED:请先填写API Key");
      return;
    }

    const draft = draftMap[record.code];
    if (!draft) {
      setError(`DRAFT_NOT_FOUND:${record.code}`);
      return;
    }

    const nextCode = draft.code.trim();
    const nextUrl = draft.url.trim();

    const payload: { newCode?: string; newUrl?: string } = {};
    if (nextCode !== record.code) {
      payload.newCode = nextCode;
    }
    if (nextUrl !== record.url) {
      payload.newUrl = nextUrl;
    }
    if (!payload.newCode && !payload.newUrl) {
      return;
    }

    setError("");
    setRunningCode(record.code);
    try {
      await updateShortLink(record.code, payload, apiKey.trim());
      await loadList();
    } catch (updateError) {
      setError(toErrorMessage(updateError));
    } finally {
      setRunningCode("");
    }
  }

  async function handleDelete(record: ShortLinkRecord): Promise<void> {
    if (!apiKey.trim()) {
      setError("UNAUTHORIZED:请先填写API Key");
      return;
    }

    const confirmed = window.confirm(`确认删除短链${record.code}吗`);
    if (!confirmed) {
      return;
    }

    setError("");
    setRunningCode(record.code);
    try {
      await deleteShortLink(record.code, apiKey.trim());
      await loadList();
    } catch (deleteError) {
      setError(toErrorMessage(deleteError));
    } finally {
      setRunningCode("");
    }
  }

  async function handleReload(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await loadList();
  }

  return (
    <section className="panel">
      <h2>管理短链接</h2>
      <form className="inline-tools" onSubmit={handleReload}>
        <label>
          API Key
          <input
            type="password"
            value={apiKey}
            placeholder="用于修改和删除"
            onChange={(event) => persistApiKey(event.target.value)}
          />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? "刷新中..." : "刷新列表"}
        </button>
        <button type="button" className="secondary" onClick={clearApiKey}>
          清除Key
        </button>
      </form>
      {error ? <p className="error-text">{error}</p> : null}
      {!loading && !hasData ? <p className="muted">暂无数据</p> : null}
      {hasData ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>code</th>
                <th>url</th>
                <th>createdAt</th>
                <th>updatedAt</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => {
                const draft = draftMap[record.code] ?? { code: record.code, url: record.url };
                const isRunning = runningCode === record.code;
                return (
                  <tr key={record.code}>
                    <td>
                      <input
                        value={draft.code}
                        onChange={(event) => updateDraft(record.code, { code: event.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        value={draft.url}
                        onChange={(event) => updateDraft(record.code, { url: event.target.value })}
                      />
                    </td>
                    <td>{record.createdAt}</td>
                    <td>{record.updatedAt}</td>
                    <td className="actions">
                      <button type="button" onClick={() => void handleSave(record)} disabled={isRunning}>
                        保存
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => void handleDelete(record)}
                        disabled={isRunning}
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return `${error.code}: ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "UNKNOWN_ERROR";
}
