import React from 'react';
import {
  Activity,
  BadgeCheck,
  Building2,
  Clock,
  KeyRound,
  Mail,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import SectionShell, { MetricCard, StatusPill } from '@/components/SectionShell';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const permissions = [
  'Create and manage claim intake flows',
  'Upload and classify claim documents',
  'Review AI validation issues',
  'Generate UB-04 and EDI submission packets',
  'Submit approved claims to TPA queue',
];

const activity = [
  ['09:42 AM', 'Reviewed CLM-2847 signature warning'],
  ['10:18 AM', 'Uploaded insurance card for CLM-2851'],
  ['11:05 AM', 'Generated master PDF for CLM-2848'],
  ['12:22 PM', 'Submitted Star Health batch queue'],
];

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const profileName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Profile';
  const profileEmail = user?.email || '';
  const profileRole = user?.user_metadata?.role
    ? String(user.user_metadata.role).replace(/_/g, ' ')
    : 'Insurance Desk';
  const hospitalName = user?.user_metadata?.organization || 'Hospital workspace';
  const initials = profileName
    .split(' ')
    .map((part: string) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <SectionShell
      currentPath="/profile"
      title="My Profile"
      subtitle="Workspace identity, role permissions, security status, and daily claim operations."
      action={<button className="btn-primary">Edit Profile</button>}
    >
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <div className="xl:col-span-1 space-y-5">
          <div className="card p-6 text-center">
            <div className="w-20 h-20 rounded-3xl bg-primary mx-auto mb-4 flex items-center justify-center shadow-card-md">
              <span className="text-2xl font-bold text-white">{initials || 'U'}</span>
            </div>
            <h2 className="text-xl font-bold text-foreground capitalize">{profileName}</h2>
            <p className="text-sm text-muted-foreground mt-1 capitalize">{profileRole}</p>
            <div className="mt-4 flex justify-center">
              <StatusPill tone="success">Active</StatusPill>
            </div>
          </div>

          <div className="card p-5 space-y-4">
            <ProfileLine icon={Mail} label="Email" value={profileEmail} />
            <ProfileLine icon={Building2} label="Hospital" value={hospitalName} />
            <ProfileLine icon={UserRound} label="Role" value={profileRole} />
            <ProfileLine icon={Clock} label="Shift" value="09:00 AM - 05:00 PM" />
          </div>
        </div>

        <div className="xl:col-span-3 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <MetricCard label="Claims Today" value="42" helper="Handled by Sneha" tone="info" />
            <MetricCard
              label="Ready Packets"
              value="9"
              helper="Generated for submission"
              tone="success"
            />
            <MetricCard
              label="Open Repairs"
              value="5"
              helper="Needs manual review"
              tone="warning"
            />
            <MetricCard
              label="Accuracy"
              value="96%"
              helper="Review acceptance rate"
              tone="success"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <ShieldCheck size={18} className="text-primary" />
                <h2 className="section-header">Role Permissions</h2>
              </div>
              <div className="space-y-3">
                {permissions.map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <BadgeCheck size={15} className="text-success mt-0.5 shrink-0" />
                    <p className="text-sm text-foreground">{item}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <KeyRound size={18} className="text-primary" />
                <h2 className="section-header">Security</h2>
              </div>
              <div className="space-y-4">
                {[
                  ['Session status', 'Signed in with active secure session', 'Active'],
                  ['Access level', 'Hospital workspace scoped access', 'Scoped'],
                  ['API role', `Supabase role: ${profileRole}`, 'Enabled'],
                ].map(([label, helper, status]) => (
                  <div
                    key={label}
                    className="flex items-center gap-3 pb-3 border-b border-border last:border-0 last:pb-0"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-foreground">{label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{helper}</p>
                    </div>
                    <StatusPill tone="info">{status}</StatusPill>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-2">
              <Activity size={18} className="text-primary" />
              <h2 className="section-header">Recent Activity</h2>
            </div>
            <div className="divide-y divide-border">
              {activity.map(([time, item]) => (
                <div
                  key={`${time}-${item}`}
                  className="px-5 py-4 flex items-center gap-4 hover:bg-muted/40 transition-colors"
                >
                  <span className="text-xs font-bold text-muted-foreground font-tabular w-20">
                    {time}
                  </span>
                  <p className="text-sm text-foreground">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </SectionShell>
  );
}

function ProfileLine({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center shrink-0">
        <Icon size={15} className="text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold text-foreground break-words">{value}</p>
      </div>
    </div>
  );
}
