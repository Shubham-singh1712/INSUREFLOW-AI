import React from 'react';
import { BookOpen, Download, FileText, Layers3 } from 'lucide-react';
import SectionShell, { MetricCard, StatusPill } from '@/components/SectionShell';
import { getDemoModeState } from '@/lib/demoMode';

const packetSections = [
  'Claim summary cover page',
  'AI verification page',
  'Document index with bookmarks',
  'Insurance card',
  'Discharge summary',
  'Invoices and lab reports',
];
const packets = [
  ['CLM-2848', '42 pages', 'Generated'],
  ['CLM-2849', '35 pages', 'Generated'],
  ['CLM-2850', '18 pages', 'Blocked'],
];

export default async function PdfGenerationPage() {
  const demoMode = await getDemoModeState();
  const visibleSections = demoMode.enabled ? packetSections : [];
  const visiblePackets = demoMode.enabled ? packets : [];

  return (
    <SectionShell
      currentPath="/pdf-generation"
      title="PDF Generation"
      subtitle={
        demoMode.enabled
          ? 'Demo packet builder populated with mock document exports.'
          : 'Live packet builder. Demo packet data is hidden because Demo Mode is off.'
      }
      action={
        <button className="btn-primary gap-2">
          <FileText size={15} /> Generate Packet
        </button>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          label="Generated Today"
          value={demoMode.enabled ? '9' : '0'}
          helper="Master claim packets"
          tone="success"
        />
        <MetricCard
          label="Draft Packets"
          value={demoMode.enabled ? '4' : '0'}
          helper="Waiting on final validation"
          tone="warning"
        />
        <MetricCard
          label="Avg Pages"
          value={demoMode.enabled ? '37' : '0'}
          helper="Per claim packet"
          tone="info"
        />
        <MetricCard label="Export Format" value="PDF" helper="TPA portal ready" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card p-5">
          <h2 className="section-header mb-4">Packet Builder</h2>
          {visibleSections.map((item, index) => (
            <div
              key={item}
              className="flex items-center gap-3 py-3 border-b border-border last:border-0"
            >
              <span className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                {index + 1}
              </span>
              <span className="text-sm font-medium text-foreground">{item}</span>
            </div>
          ))}
          {visibleSections.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              No live packet template has been loaded yet. Turn on Demo Mode in Settings to view the
              mock builder.
            </div>
          )}
        </div>
        <div className="card p-5">
          <h2 className="section-header mb-4">Recent Packets</h2>
          {visiblePackets.map(([claim, pages, status]) => (
            <div
              key={claim}
              className="flex items-center gap-4 p-4 rounded-xl border border-border mb-3 last:mb-0"
            >
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                {status === 'Generated' ? (
                  <Download size={17} className="text-success" />
                ) : (
                  <Layers3 size={17} className="text-warning" />
                )}
              </div>
              <div className="flex-1">
                <p className="font-bold text-foreground font-tabular">{claim}</p>
                <p className="text-xs text-muted-foreground">{pages} - indexed export packet</p>
              </div>
              <StatusPill tone={status === 'Generated' ? 'success' : 'warning'}>
                {status}
              </StatusPill>
            </div>
          ))}
          {visiblePackets.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              No live packets have been generated yet. Turn on Demo Mode in Settings to view mock
              packets.
            </div>
          )}
          {demoMode.enabled && (
            <div className="mt-5 p-4 rounded-xl bg-info-bg/50 border border-info/20">
              <BookOpen size={18} className="text-info mb-2" />
              <p className="text-sm font-semibold text-foreground">
                Master PDF includes an audit-friendly verification page.
              </p>
            </div>
          )}
        </div>
      </div>
    </SectionShell>
  );
}
