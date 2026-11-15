import { NavLink } from 'react-router-dom'

export default function Sidebar({ items, open }) {
  return (
    <aside
      className={`app-sidebar${open ? ' is-open' : ''}`}
      aria-label="Primary navigation"
    >
      <div className="sidebar-brand">
        <span className="sidebar-brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
            <circle cx="12" cy="12" r="2.6" fill="currentColor" />
          </svg>
        </span>
        <span className="sidebar-brand-name">Halgheh</span>
      </div>

      <nav className="sidebar-nav">
        <ul>
          {items.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `sidebar-link${isActive ? ' is-active' : ''}`
                }
              >
                <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}
