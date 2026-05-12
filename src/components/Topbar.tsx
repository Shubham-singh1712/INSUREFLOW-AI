'use client';
import React, { useEffect, useState } from 'react';
import { Menu, Search, Bell, ChevronDown, Settings, LogOut, User, SidebarClose, SidebarOpen } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface TopbarProps {
  onMenuClick: () => void;
  onSidebarToggle: () => void;
  sidebarCollapsed: boolean;
}

const notifications = [
  { id: 'notif-001', type: 'warning', message: 'Claim CLM-2847 has missing signature on discharge summary', time: '4m ago' },
  { id: 'notif-002', type: 'danger', message: 'OCR extraction failed for Claim CLM-2851 — insurance card unreadable', time: '12m ago' },
  { id: 'notif-003', type: 'success', message: 'Claim CLM-2839 passed all validations — ready for submission', time: '28m ago' },
  { id: 'notif-004', type: 'info', message: 'TPA Apollo Munich: 3 claims approved in last batch', time: '1h ago' },
  { id: 'notif-005', type: 'warning', message: 'Blur score too low on lab report for Claim CLM-2845', time: '2h ago' },
];

export default function Topbar({ onMenuClick, onSidebarToggle, sidebarCollapsed }: TopbarProps) {
  const router = useRouter();
  const supabase = createClient();
  const { user } = useAuth();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [demoModeEnabled, setDemoModeEnabled] = useState(false);
  const visibleNotifications = demoModeEnabled ? notifications : [];
  const unreadCount = demoModeEnabled ? 3 : 0;

  const profileName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Profile';
  const profileEmail = user?.email || '';
  const profileRole = user?.user_metadata?.role
    ? String(user.user_metadata.role).replace(/_/g, ' ')
    : 'Insurance Desk';
  const initials = profileName
    .split(' ')
    .map((part: string) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  useEffect(() => {
    fetch('/api/settings/demo-mode', { cache: 'no-store' })
      .then(async (response) => ({ response, payload: await response.json() }))
      .then(({ response, payload }) => {
        if (response.ok && payload.ok) setDemoModeEnabled(Boolean(payload.data.enabled));
      })
      .catch(() => setDemoModeEnabled(false));
  }, []);

  return (
    <header className="h-16 bg-card border-b border-border flex items-center px-4 lg:px-6 gap-4 shrink-0 z-30 relative">
      {/* Mobile menu */}
      <button onClick={onMenuClick} className="lg:hidden btn-ghost p-2">
        <Menu size={18} />
      </button>

      {/* Sidebar toggle (desktop) */}
      <button onClick={onSidebarToggle} className="hidden lg:flex btn-ghost p-2" title="Toggle sidebar">
        {sidebarCollapsed ? <SidebarOpen size={18} /> : <SidebarClose size={18} />}
      </button>

      {/* Search */}
      <div className="flex-1 max-w-md">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search claims, patients, TPAs... (⌘K)"
            className="w-full pl-9 pr-4 py-2 text-sm bg-muted border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-ring focus:bg-white transition-all placeholder:text-muted-foreground/60"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        {/* Submission deadline chip */}
        {demoModeEnabled && (
          <div className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-warning-bg border border-warning/20 text-xs font-semibold text-warning-foreground">
            <div className="w-1.5 h-1.5 rounded-full bg-warning" />
            Submission closes in 2h 14m
          </div>
        )}

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => { setShowNotifications(!showNotifications); setShowProfile(false); }}
            className="relative btn-ghost p-2"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-danger text-white text-xs font-bold flex items-center justify-center leading-none">
                {unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 top-full mt-2 w-96 bg-card rounded-2xl border border-border shadow-card-lg z-50 overflow-hidden fade-in">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <span className="font-semibold text-sm text-foreground">Notifications</span>
                {unreadCount > 0 && <span className="badge-danger">{unreadCount} new</span>}
              </div>
              <div className="max-h-80 overflow-y-auto scrollbar-thin">
                {visibleNotifications.map((n) => (
                  <div key={n.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted transition-colors cursor-pointer border-b border-border last:border-0">
                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                      n.type === 'danger' ? 'bg-danger' :
                      n.type === 'warning' ? 'bg-warning' :
                      n.type === 'success' ? 'bg-success' : 'bg-info'
                    }`} />
                    <div className="min-w-0">
                      <p className="text-xs text-foreground leading-relaxed">{n.message}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{n.time}</p>
                    </div>
                  </div>
                ))}
                {visibleNotifications.length === 0 && (
                  <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                    No live notifications are loaded yet. Turn on Demo Mode in Settings to view mock alerts.
                  </div>
                )}
              </div>
              <div className="px-4 py-2.5 border-t border-border">
                <Link href="/notifications" className="text-xs text-primary font-semibold hover:underline">
                  View all notifications
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Profile */}
        <div className="relative">
          <button
            onClick={() => { setShowProfile(!showProfile); setShowNotifications(false); }}
            className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-muted transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center">
              <span className="text-xs font-bold text-white">{initials || 'U'}</span>
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-semibold text-foreground leading-tight capitalize">{profileName}</p>
              <p className="text-xs text-muted-foreground capitalize">{profileRole}</p>
            </div>
            <ChevronDown size={14} className="text-muted-foreground hidden sm:block" />
          </button>

          {showProfile && (
            <div className="absolute right-0 top-full mt-2 w-52 bg-card rounded-2xl border border-border shadow-card-lg z-50 overflow-hidden fade-in">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-sm font-semibold text-foreground capitalize">{profileName}</p>
                <p className="text-xs text-muted-foreground">{profileEmail}</p>
              </div>
              <div className="p-1.5">
                <Link href="/profile" className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-muted rounded-xl transition-colors">
                  <User size={14} className="text-muted-foreground" /> My Profile
                </Link>
                <button className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-muted rounded-xl transition-colors">
                  <Settings size={14} className="text-muted-foreground" /> Settings
                </button>
                <div className="border-t border-border my-1" />
                <button onClick={handleSignOut} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-danger hover:bg-danger-bg rounded-xl transition-colors">
                  <LogOut size={14} /> Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
