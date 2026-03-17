import { Link, NavLink } from "react-router-dom";

export function Header() {
  return (
    <header className="nova-header">
      <div className="nova-header-left">
        <div className="nova-logo" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
          </svg>
        </div>
        <div>
          <Link to="/" className="nova-app-name">Nova OpenCode</Link>
          <div className="nova-app-subtitle">Conversation board</div>
        </div>
      </div>
      <nav className="nova-nav">
        <NavLink to="/" className={({ isActive }) => `nova-nav-link${isActive ? " active" : ""}`} end>
          Board
        </NavLink>
        <NavLink to="/archive" className={({ isActive }) => `nova-nav-link${isActive ? " active" : ""}`}>
          Archive
        </NavLink>
      </nav>
    </header>
  );
}
