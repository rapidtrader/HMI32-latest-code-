import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ROUTES } from '../routes/paths';

const navItems = [
  {
    path: ROUTES.MONITOR,
    label: 'HMI32 Monitor',
    tone: 'violet',
    icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  },
  {
    path: ROUTES.MACHINE_INFO,
    label: 'Machine Info',
    tone: 'green',
    icon: 'M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18',
  },
  {
    path: ROUTES.REPORTS,
    label: 'Reports',
    tone: 'blue',
    icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  },
  {
    path: ROUTES.CAMERA_VIDEOS,
    label: 'Camera Videos',
    tone: 'purple',
    icon: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z',
  },
  {
    path: ROUTES.SAVED_VIDEOS,
    label: 'Saved Videos',
    tone: 'cyan',
    icon: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4',
  },
  {
    path: ROUTES.GPS,
    label: 'GPS Tracking',
    tone: 'rose',
    icon: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z',
  },
  {
    path: ROUTES.LIVE_MAP,
    label: 'Live Map',
    tone: 'violet',
    icon: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-1.447-.894L15 4m0 13V4m0 0L9 7',
  },
  {
    path: ROUTES.SWEEPER_MONITORING,
    label: 'Sweeper Monitoring',
    tone: 'green',
    icon: 'M4 14c2-2 4-2 6 0s4 2 6 0M6 10l2-2M12 10l2-2M18 10l2-2',
  },
  {
    path: ROUTES.VEHICLE_HISTORY,
    label: 'Vehicle History',
    tone: 'purple',
    icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    id: 'sweeping-mgmt',
    label: 'Sweeping Mgmt',
    tone: 'indigo',
    icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
    children: [
      { path: ROUTES.SWEEPING_PROJECT, label: 'Project', tone: 'violet' },
      { path: ROUTES.SWEEPING_MACHINES, label: 'Machines', tone: 'green' },
      { path: ROUTES.SWEEPING_ROADS, label: 'Roads', tone: 'blue' },
      { path: ROUTES.SWEEPING_DAILY_PLAN, label: 'Daily Plan', tone: 'purple' },
      { path: ROUTES.SWEEPING_MACHINE_TRACKING, label: 'Machine Tracking', tone: 'rose' },
      { path: ROUTES.SWEEPING_PLAN_VS_ACTUAL, label: 'Plan vs Actual', tone: 'amber' },
    ],
  },
];

const NavIcon = ({ d }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const SidebarNavLink = ({ item, onClose }) => (
  <NavLink
    to={item.path}
    onClick={onClose}
    className={({ isActive }) =>
      `app-sidebar__link ${isActive ? 'app-sidebar__link--active' : ''}`
    }
  >
    {({ isActive }) => (
      <>
        <span className={`app-sidebar__icon app-sidebar__icon--${item.tone || 'violet'}`}>
          <NavIcon d={item.icon} />
        </span>
        <span className="app-sidebar__label">{item.label}</span>
        {isActive && <span className="app-sidebar__chev" aria-hidden>›</span>}
      </>
    )}
  </NavLink>
);

const SidebarNavGroup = ({ item, onClose }) => {
  const { pathname } = useLocation();
  const childActive = item.children.some(
    (child) => pathname === child.path || pathname.startsWith(`${child.path}/`),
  );
  const [open, setOpen] = useState(childActive);

  useEffect(() => {
    if (childActive) setOpen(true);
  }, [childActive]);

  return (
    <div className={`app-sidebar__group ${open ? 'app-sidebar__group--open' : ''}`}>
      <button
        type="button"
        className={`app-sidebar__link app-sidebar__group-toggle ${childActive ? 'app-sidebar__group-toggle--active' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        <span className={`app-sidebar__icon app-sidebar__icon--${item.tone || 'indigo'}`}>
          <NavIcon d={item.icon} />
        </span>
        <span className="app-sidebar__label">{item.label}</span>
        <span className={`app-sidebar__drop ${open ? 'app-sidebar__drop--open' : ''}`} aria-hidden>
          ⌄
        </span>
      </button>
      <div className="app-sidebar__subnav">
        {item.children.map((child) => (
          <NavLink
            key={child.path}
            to={child.path}
            onClick={onClose}
            className={({ isActive }) =>
              `app-sidebar__sublink ${isActive ? 'app-sidebar__sublink--active' : ''}`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`app-sidebar__subdot app-sidebar__subdot--${child.tone || 'violet'}`} />
                <span className="app-sidebar__label">{child.label}</span>
                {isActive && <span className="app-sidebar__chev app-sidebar__chev--sm">›</span>}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </div>
  );
};

const Sidebar = ({ isOpen, onClose }) => {
  const { logout, username } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate(ROUTES.LOGIN, { replace: true });
  };

  return (
    <>
      {isOpen && (
        <div className="app-sidebar-overlay" onClick={onClose} aria-hidden="true" />
      )}

      <aside className={`app-sidebar ${isOpen ? 'app-sidebar--open' : ''}`}>
        <div className="app-sidebar__top">
          <div className="app-sidebar__brand">
            <div className="app-sidebar__logo">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <p className="app-sidebar__title">HMI32</p>
              <p className="app-sidebar__subtitle">Machine Monitoring</p>
            </div>
          </div>

          <button type="button" onClick={onClose} className="app-sidebar__close lg:hidden" aria-label="Close menu">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="app-sidebar__nav">
          {navItems.map((item) =>
            item.children ? (
              <SidebarNavGroup key={item.id} item={item} onClose={onClose} />
            ) : (
              <SidebarNavLink key={item.path} item={item} onClose={onClose} />
            ),
          )}
        </nav>

        <div className="app-sidebar__footer">
          <div className="app-sidebar__status">
            <div className="app-sidebar__status-row">
              <span className={`app-sidebar__icon app-sidebar__icon--green app-sidebar__icon--sm`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12l4 4L19 6" strokeLinecap="round" />
                </svg>
              </span>
              <div>
                <p className="app-sidebar__status-label">System Online</p>
                {username && <p className="app-sidebar__user">{username}</p>}
              </div>
            </div>
          </div>

          <button type="button" onClick={handleLogout} className="app-sidebar__logout">
            <span className="app-sidebar__icon app-sidebar__icon--slate app-sidebar__icon--sm">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </span>
            Logout
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;