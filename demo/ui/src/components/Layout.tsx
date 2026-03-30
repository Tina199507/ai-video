import { NavLink, Outlet } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/', label: '📊 Dashboard' },
  { to: '/accounts', label: '👤 Accounts' },
];

export function Layout() {
  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>🤖 AI Workbench</h1>
        <nav>
          {NAV_ITEMS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
