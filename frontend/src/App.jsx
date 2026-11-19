import { lazy, Suspense, useEffect, useState } from 'react';
import { fetchHealth } from './lib/api.js';
import { Loading } from './components/ui.jsx';
import { WorkloadProvider } from './store.jsx';

// Every page is code-split with React.lazy.
const PAGES = [
  { id: 'dashboard', label: 'Dashboard', group: 'Run', C: lazy(() => import('./pages/Dashboard.jsx')) },
  { id: 'simulator', label: 'Simulator', group: 'Run', C: lazy(() => import('./pages/Simulator.jsx')) },
  { id: 'timeline', label: 'Timeline', group: 'Run', C: lazy(() => import('./pages/Timeline.jsx')) },
  { id: 'compare', label: 'Compare policies', group: 'Analyse', C: lazy(() => import('./pages/Compare.jsx')) },
  { id: 'aging', label: 'Starvation and aging', group: 'Analyse', C: lazy(() => import('./pages/Aging.jsx')) },
  { id: 'multi', label: 'Multi-doctor', group: 'Analyse', C: lazy(() => import('./pages/MultiDoctor.jsx')) },
  { id: 'resources', label: 'I/O and resources', group: 'Labs', C: lazy(() => import('./pages/Resources.jsx')) },
  { id: 'sync', label: 'Sync lab', group: 'Labs', C: lazy(() => import('./pages/SyncLab.jsx')) },
  { id: 'trace', label: 'Trace', group: 'Labs', C: lazy(() => import('./pages/Trace.jsx')) },
  { id: 'concepts', label: 'Concepts and viva', group: 'Learn', C: lazy(() => import('./pages/Concepts.jsx')) },
];

function currentPage() {
  const id = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  return PAGES.find((p) => p.id === id) || PAGES[0];
}


export default function App() {
  const [page, setPage] = useState(currentPage);
  const [menu, setMenu] = useState(false);
  const [health, setHealth] = useState('checking');

  useEffect(() => {
    const on = () => {
      setPage(currentPage());
      setMenu(false);
      window.scrollTo(0, 0);
      document.getElementById('main')?.focus({ preventScroll: true });   // announce the new page to screen readers
    };
    const esc = (e) => { if (e.key === 'Escape') setMenu(false); };
    window.addEventListener('hashchange', on);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('hashchange', on); window.removeEventListener('keydown', esc); };
  }, []);
  useEffect(() => { document.title = `${page.label} | MediQueue OS`; }, [page]);
  useEffect(() => {
    fetchHealth().then(() => setHealth('ok')).catch(() => setHealth('down'));
  }, []);

  const groups = [...new Set(PAGES.map((p) => p.group))];
  const Page = page.C;
  return (
    <WorkloadProvider>
      <a className="skip" href="#main">Skip to content</a>
      <div className="app">
        <nav className={`sidebar${menu ? ' open' : ''}`} aria-label="Main">
          <div className="brand"><span className="brand-mark" aria-hidden="true">+</span>MediQueue OS</div>
          {groups.map((g) => (
            <div key={g}>
              <div className="nav-group">{g}</div>
              <ul className="nav">
                {PAGES.filter((p) => p.group === g).map((p) => (
                  <li key={p.id}>
                    <a href={`#/${p.id}`} aria-current={p.id === page.id ? 'page' : undefined}>
                      <span className="nav-key" aria-hidden="true">{PAGES.indexOf(p) + 1}</span>{p.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="content">
          <header className="topbar">
            <div className="row-tight">
              <button className="btn btn-sm menu-btn" type="button" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>Menu</button>
              <p className="disclaimer">A simulation for evaluating queue policies. Not a clinical system; priority levels are human inputs.</p>
            </div>
            <span className={`tag ${health === 'ok' ? 'tag-good' : health === 'down' ? 'tag-bad' : 'tag-state'}`} role="status">
              {health === 'ok' ? 'Backend connected' : health === 'down' ? 'Backend offline: run make backend' : 'Checking backend…'}
            </span>
          </header>
          <main id="main" className="main" tabIndex={-1}>
            <Suspense fallback={<Loading height={320} label="Loading page" />}>
              <Page />
            </Suspense>
          </main>
        </div>
      </div>
    </WorkloadProvider>
  );
}
