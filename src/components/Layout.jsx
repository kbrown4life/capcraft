import React from 'react';

export function TopNav({ route, setRoute, user, onLogout }) {
  const links = ['Home', 'Dashboard', 'Create League', 'Join League'];
  return (
    <header className="topbar">
      <button className="brand" onClick={() => setRoute('Home')}>CAPCRAFT</button>
      <nav className="navlinks">
        {links.map((item) => (
          <button key={item} className={route === item ? 'nav active' : 'nav'} onClick={() => setRoute(item)}>{item}</button>
        ))}
      </nav>
      <div className="account-strip">
        {user ? (
          <>
            <span className="small-label">GM</span>
            <span className="account-name">{user.display_name || user.username || 'Signed In'}</span>
            <button className="text-btn" onClick={onLogout}>Sign Out</button>
          </>
        ) : (
          <button className="text-btn" onClick={() => setRoute('Auth')}>Sign In</button>
        )}
      </div>
    </header>
  );
}

export function Shell({ children }) {
  return <main className="shell">{children}</main>;
}

export function Panel({ eyebrow, title, children, className = '' }) {
  return (
    <section className={`panel ${className}`}>
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      {title && <h2 className="panel-title">{title}</h2>}
      {children}
    </section>
  );
}

export function StatusPill({ children }) {
  return <span className="pill">{children}</span>;
}
