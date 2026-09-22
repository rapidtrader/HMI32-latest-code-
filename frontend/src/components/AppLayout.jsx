import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

const AppLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="app-shell">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="app-main">
        <div className="app-mobile-bar lg:hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="app-mobile-bar__menu"
            aria-label="Open menu"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="app-mobile-bar__title">HMI32 System</span>
        </div>

        <main className="app-main__content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
