import { Link } from "react-router-dom";

export function NotFoundPage(): JSX.Element {
  return (
    <section className="panel not-found">
      <h2>页面不存在</h2>
      <p className="muted">你访问的路径无效，请返回功能页面。</p>
      <Link className="back-link" to="/">
        回到创建页
      </Link>
    </section>
  );
}
