const PageLayout = ({
  title,
  subtitle,
  loading,
  loadingText = 'Loading...',
  error,
  onRefresh,
  children,
}) => {
  if (loading) {
    return (
      <div className="hmi32-page hmi32-page--loading">
        <div className="hmi32-spinner" />
        <p>{loadingText}</p>
      </div>
    );
  }

  return (
    <div className="hmi32-page">
      <header className="hmi32-topbar">
        <div className="hmi32-topbar__left">
          <span className="hmi32-topbar__dot" />
          <div>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
        </div>
        {onRefresh && (
          <div className="hmi32-topbar__right">
            <button type="button" className="hmi32-topbar__icon" aria-label="Notifications">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button type="button" className="hmi32-topbar__icon" aria-label="Profile">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="8" r="4" />
                <path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6" strokeLinecap="round" />
              </svg>
            </button>
            <button type="button" className="hmi32-topbar__refresh" onClick={onRefresh}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4v5h.6M20 20v-5h-.6M5 9a7 7 0 0112.8-2M19 15a7 7 0 01-12.8 2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Refresh
            </button>
          </div>
        )}
      </header>

      <div className="hmi32-body">
        {error && <div className="hmi32-alert">{error.message}</div>}
        {children}
      </div>
    </div>
  );
};

export default PageLayout;
