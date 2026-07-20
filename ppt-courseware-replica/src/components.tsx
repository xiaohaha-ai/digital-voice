import { Bell, ChevronDown, Headphones, MessageCircleMore } from 'lucide-react'
import type { PageId } from './App'
import { navItems } from './data'

export function Header() {
  return (
    <header className="top-header">
      <div className="brand-lockup">
        <span className="brand-mark"><Headphones size={23} strokeWidth={1.75} /></span>
        <strong>神小童</strong>
      </div>
      <p className="header-slogan">智能教学系统,让录课更加智能 - 简单</p>
      <div className="header-actions">
        <button className="message-button" type="button" aria-label="客服微信"><MessageCircleMore size={20} /><span>客服微信</span></button>
        <button className="notification-button" type="button" aria-label="通知"><Bell size={20} /></button>
        <button className="user-menu" type="button"><span className="user-avatar">T</span><span>teacher4</span><ChevronDown size={16} /></button>
      </div>
    </header>
  )
}

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
