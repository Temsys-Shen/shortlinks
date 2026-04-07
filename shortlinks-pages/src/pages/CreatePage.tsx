import { FormEvent, useState } from "react";
import { ApiError, createShortLink } from "../lib/api";
import type { ShortLinkRecord } from "../types";

export function CreatePage(): JSX.Element {
  const [url, setUrl] = useState("");
  const [code, setCode] = useState("");
  const [result, setResult] = useState<ShortLinkRecord | null>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const payload = {
        url: url.trim(),
        code: code.trim() ? code.trim() : undefined,
      };
      const record = await createShortLink(payload);
      setResult(record);
    } catch (submissionError) {
      if (submissionError instanceof ApiError) {
        setError(`${submissionError.code}: ${submissionError.message}`);
      } else if (submissionError instanceof Error) {
        setError(submissionError.message);
      } else {
        setError("UNKNOWN_ERROR");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel">
      <h2>创建短链接</h2>
      <p className="muted">`url`必填，`code`选填。若`url`已存在会直接复用已有短链。</p>
      <form className="form-grid" onSubmit={handleSubmit}>
        <label>
          目标URL
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/page"
            required
            type="url"
          />
        </label>
        <label>
          短码
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="可留空自动生成"
            type="text"
          />
        </label>
        <button disabled={loading} type="submit">
          {loading ? "提交中..." : "创建短链接"}
        </button>
      </form>
      {error ? <p className="error-text">{error}</p> : null}
      {result ? (
        <article className="result-card">
          <h3>结果</h3>
          <dl>
            <dt>shortUrl</dt>
            <dd>
              <a href={toShortUrl(result.code)} target="_blank" rel="noreferrer">
                {toShortUrl(result.code)}
              </a>
            </dd>
            <dt>code</dt>
            <dd>{result.code}</dd>
            <dt>url</dt>
            <dd>{result.url}</dd>
            <dt>createdAt</dt>
            <dd>{result.createdAt}</dd>
            <dt>updatedAt</dt>
            <dd>{result.updatedAt}</dd>
          </dl>
        </article>
      ) : null}
    </section>
  );
}

function toShortUrl(code: string): string {
  return `${window.location.origin}/${encodeURIComponent(code)}`;
}
