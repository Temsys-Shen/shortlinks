import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ApiError, getShortLinkByCode } from "../lib/api";

const CODE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function RedirectPage(): JSX.Element {
  const { code } = useParams<{ code: string }>();
  const [, setError] = useState("");

  useEffect(() => {
    if (!code) {
      setError("INVALID_CODE:短码不能为空");
      return;
    }
    if (!CODE_PATTERN.test(code)) {
      setError("INVALID_CODE:短码格式不合法");
      return;
    }
    const validCode = code;

    let cancelled = false;
    async function resolveShortLink() {
      try {
        const record = await getShortLinkByCode(validCode);
        if (!cancelled) {
          window.location.replace(record.url);
        }
      } catch (resolveError) {
        if (cancelled) {
          return;
        }
        if (resolveError instanceof ApiError) {
          setError(`${resolveError.code}:${resolveError.message}`);
        } else if (resolveError instanceof Error) {
          setError(resolveError.message);
        } else {
          setError("UNKNOWN_ERROR");
        }
      }
    }

    void resolveShortLink();

    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <section className="panel resolver">
      正在跳转
    </section>
  );
}
