'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import AppLogo from './ui/AppLogo';
import { useAuth } from '@/contexts/AuthContext';
import {
  LayoutDashboard,
  FileText,
  Upload,
  ShieldCheck,
  BarChart3,
  Settings,
  Users,
  FileOutput,
  Bell,
  ChevronRight,
  Zap,
} from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onMobileClose: () => void;
  currentPath: string;
}

const navGroups = [
  {
    label: 'Operations',
    items: [
      { href: '/main-dashboard', label: 'Dashboard', icon: LayoutDashboard, badge: null },
      { href: '/claim-intake-document-upload', label: 'New Claim', icon: Upload, badge: null },
      { href: '/all-claims', label: 'All Claims', icon: FileText, badge: '3', demoOnly: true },
      {
        href: '/validation-queue',
        label: 'Validation Queue',
        icon: ShieldCheck,
        badge: '5',
        demoOnly: true,
      },
    ],
  },
  {
    label: 'Submissions',
    items: [
      {
        href: '/submission-queue',
        label: 'Submission Queue',
        icon: FileOutput,
        badge: '2',
        demoOnly: true,
      },
      { href: '/pdf-generation', label: 'PDF Generation', icon: FileText, badge: null },
    ],
  },
  {
    label: 'Insights',
    items: [
      { href: '/analytics', label: 'Analytics', icon: BarChart3, badge: null },
      { href: '/notifications', label: 'Notifications', icon: Bell, badge: '7', demoOnly: true },
    ],
  },
  {
    label: 'Admin',
    items: [
      { href: '/team-roles', label: 'Team & Roles', icon: Users, badge: null },
      { href: '/settings', label: 'Settings', icon: Settings, badge: null },
    ],
  },
];

export default function Sidebar({
  collapsed,
  mobileOpen,
  onMobileClose,
  currentPath,
}: SidebarProps) {
  const isActive = (href: string) => {
    return href === currentPath;
  };

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`
          hidden lg:flex flex-col bg-sidebar-bg border-r border-white/10
          sidebar-transition overflow-hidden shrink-0 shadow-sidebar
          ${collapsed ? 'w-16' : 'w-60'}
        `}
      >
        <SidebarContent collapsed={collapsed} isActive={isActive} />
      </aside>

      {/* Mobile sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 flex flex-col bg-sidebar-bg w-60
          border-r border-white/10 shadow-sidebar transition-transform duration-300
          lg:hidden
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex items-center justify-between p-4 border-b border-white/15">
          <div className="flex items-center gap-2">
            <AppLogo size={28} />
            <span className="font-bold text-white text-sm">InsureFlow AI</span>
          </div>
          <button
            onClick={onMobileClose}
            className="p-1.5 rounded-lg text-sidebar-fg hover:text-white hover:bg-sidebar-hover-bg transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <SidebarContent collapsed={false} isActive={isActive} />
      </aside>
    </>
  );
}

function SidebarContent({
  collapsed,
  isActive,
}: {
  collapsed: boolean;
  isActive: (href: string) => boolean;
}) {
  const { user } = useAuth();
  const [demoModeEnabled, setDemoModeEnabled] = useState(false);
  const profileName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Profile';
  const profileRole = user?.user_metadata?.role
    ? String(user.user_metadata.role).replace(/_/g, ' ')
    : 'Insurance Desk';
  const initials = profileName
    .split(' ')
    .map((part: string) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  useEffect(() => {
    fetch('/api/settings/demo-mode', { cache: 'no-store' })
      .then(async (response) => ({ response, payload: await response.json() }))
      .then(({ response, payload }) => {
        if (response.ok && payload.ok) setDemoModeEnabled(Boolean(payload.data.enabled));
      })
      .catch(() => setDemoModeEnabled(false));
  }, []);

  return (
    <>
      {/* Logo */}
      <div
        className={`flex items-center gap-3 p-4 border-b border-white/15 ${collapsed ? 'justify-center px-0' : ''}`}
      >
        <AppLogo size={28} />
        {!collapsed && (
          <div className="min-w-0">
            <span className="font-bold text-white text-sm leading-tight block">InsureFlow AI</span>
            <span className="text-xs text-slate-300 font-medium">Enterprise</span>
          </div>
        )}
      </div>

      {/* AI Status pill */}
      {!collapsed && (
        <div className="mx-3 mt-3 mb-1 px-3 py-2 rounded-xl bg-white/10 border border-white/15 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-success validation-pulse" />
          <span className="text-xs text-slate-100 font-semibold">AI Engine Active</span>
          <Zap size={12} className="ml-auto text-warning" />
        </div>
      )}

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin py-3 px-2">
        {navGroups.map((group) => (
          <div key={`group-${group.label}`} className="mb-4">
            {!collapsed && (
              <p className="text-xs font-bold text-slate-300 uppercase tracking-widest px-2 mb-1.5">
                {group.label}
              </p>
            )}
            {group.items.map((item) => {
              const active = isActive(item.href);
              const badge = item.demoOnly && !demoModeEnabled ? null : item.badge;
              return (
                <Link
                  key={`nav-${item.href}-${item.label}`}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={`
                    flex items-center gap-3 px-2.5 py-2 rounded-xl mb-0.5
                    transition-all duration-150 group relative
                    ${
                      active
                        ? 'bg-sidebar-active-bg text-sidebar-active-fg shadow-sm'
                        : 'text-slate-200 hover:bg-sidebar-hover-bg hover:text-white'
                    }
                    ${collapsed ? 'justify-center px-0 py-2.5' : ''}
                  `}
                >
                  <item.icon
                    size={16}
                    className={`shrink-0 ${active ? 'text-white' : 'text-slate-200 group-hover:text-white'}`}
                  />
                  {!collapsed && (
                    <>
                      <span className="text-sm font-semibold leading-none">{item.label}</span>
                      {badge && (
                        <span
                          className={`ml-auto text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${
                            active ? 'bg-white/20 text-white' : 'bg-blue-500/20 text-blue-200'
                          }`}
                        >
                          {badge}
                        </span>
                      )}
                    </>
                  )}
                  {collapsed && badge && (
                    <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-primary" />
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User profile */}
      {!collapsed && (
        <div className="p-3 border-t border-white/15">
          <Link
            href="/profile"
            className={`flex items-center gap-3 px-2 py-2 rounded-xl transition-colors ${
              isActive('/profile') ? 'bg-sidebar-active-bg text-white' : 'hover:bg-sidebar-hover-bg'
            }`}
          >
            <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-white">{initials || 'U'}</span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate capitalize">{profileName}</p>
              <p className="text-xs text-slate-300 truncate capitalize">{profileRole}</p>
            </div>
            <ChevronRight size={14} className="ml-auto text-slate-300 shrink-0" />
          </Link>
        </div>
      )}
    </>
  );
}
