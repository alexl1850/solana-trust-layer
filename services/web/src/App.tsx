import { NavLink, Route, Routes } from "react-router-dom";
import { Home } from "./pages/Home.js";
import { LiveFeed } from "./pages/LiveFeed.js";
import { Receipts } from "./pages/Receipts.js";
import { Account } from "./pages/Account.js";
import { Docs } from "./pages/Docs.js";

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink to={to} className={({ isActive }) => (isActive ? "active" : "")} end={to === "/"}>
      {label}
    </NavLink>
  );
}

export function App() {
  return (
    <div className="app-shell">
      <nav className="nav">
        <NavLink to="/" className="nav-brand">
          <span className="brand-mark" aria-hidden="true" />
          Trust Layer
        </NavLink>
        <NavItem to="/" label="Search" />
        <NavItem to="/feed" label="Live feed" />
        <NavItem to="/receipts" label="Receipts" />
        <NavItem to="/docs" label="Docs" />
        <div className="nav-spacer" />
        <NavItem to="/account" label="Account" />
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/feed" element={<LiveFeed />} />
          <Route path="/receipts" element={<Receipts />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/account" element={<Account />} />
        </Routes>
      </main>
    </div>
  );
}
