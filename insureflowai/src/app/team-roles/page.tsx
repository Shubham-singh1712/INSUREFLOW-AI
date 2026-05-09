import React from 'react';
import { Crown, Shield, UserPlus, Users } from 'lucide-react';
import SectionShell, { MetricCard, StatusPill } from '@/components/SectionShell';

const team = [
  ['Sneha Rajan', 'Insurance Desk', 'Active', '42 claims handled'],
  ['Admin User', 'Hospital Admin', 'Admin', 'Full workspace access'],
  ['Rohit Menon', 'Billing Executive', 'Active', '12 claims assigned'],
  ['Anita Rao', 'Compliance Officer', 'Review', '5 validation blockers'],
];

export default function TeamRolesPage() {
  return (
    <SectionShell
      currentPath="/team-roles"
      title="Team & Roles"
      subtitle="Manage access, hospital roles, claim ownership, and operational permissions."
      action={<button className="btn-primary gap-2"><UserPlus size={15} /> Invite User</button>}
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard label="Active Users" value="24" helper="In this hospital workspace" tone="success" />
        <MetricCard label="Admins" value="3" helper="Can manage settings and roles" tone="info" />
        <MetricCard label="Reviewers" value="6" helper="Compliance and validation users" tone="warning" />
        <MetricCard label="Invites" value="2" helper="Pending acceptance" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
        <div className="xl:col-span-3 card overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="section-header">Workspace Members</h2>
          </div>
          <div className="divide-y divide-border">
            {team.map(([name, role, status, helper]) => (
              <div key={name} className="p-5 flex items-center gap-4 hover:bg-muted/40">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  {role === 'Hospital Admin' ? <Crown size={17} className="text-primary" /> : <Users size={17} className="text-primary" />}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground">{name}</p>
                  <p className="text-sm text-muted-foreground">{role} - {helper}</p>
                </div>
                <StatusPill tone={status === 'Review' ? 'warning' : status === 'Admin' ? 'info' : 'success'}>{status}</StatusPill>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-5">
          <Shield size={20} className="text-primary mb-3" />
          <h2 className="section-header mb-2">Role Policy</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Admins can manage workspace settings, insurance desk users can process claims, and compliance officers can approve validation repairs.
          </p>
        </div>
      </div>
    </SectionShell>
  );
}
