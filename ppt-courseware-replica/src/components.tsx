import type { PageId } from './App'
import { navItems } from './data'

export function Sidebar({ page, onNavigate }: { page: PageId; onNavigate: (page: PageId) => void }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-section sidebar-featured">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button className={`nav-button ${page === id ? 'active' : ''}`} key={id} type="button" onClick={() => onNavigate(id)}>
            <Icon size={17} />{label}
          </button>
        ))}
      </div>
    </aside>
  )
}
