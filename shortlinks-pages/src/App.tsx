import { NavLink, Route, Routes } from "react-router-dom";
import { CreatePage } from "./pages/CreatePage";
import { AdminPage } from "./pages/AdminPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { RedirectPage } from "./pages/RedirectPage";

export function App(): JSX.Element {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <h1>Shortlinks</h1>
        </div>
        <nav className="app-nav">
          <NavLink
            className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
            to="/"
            end
          >
            创建
          </NavLink>
          <NavLink
            className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
            to="/admin"
          >
            管理
          </NavLink>
        </nav>
      </header>
      <main className="main-content">
        <Routes>
          <Route path="/" element={<CreatePage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/:code" element={<RedirectPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </div>
  );
}
