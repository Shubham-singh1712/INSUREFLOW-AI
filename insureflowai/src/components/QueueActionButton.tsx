'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send, ShieldCheck } from 'lucide-react';

type QueueActionButtonProps = {
  endpoint: string;
  label: string;
  runningLabel: string;
  doneLabel: string;
  icon: 'send' | 'shield';
  disabled?: boolean;
  disabledLabel?: string;
};

export default function QueueActionButton({
  endpoint,
  label,
  runningLabel,
  doneLabel,
  icon,
  disabled = false,
  disabledLabel,
}: QueueActionButtonProps) {
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const Icon = icon === 'shield' ? ShieldCheck : Send;

  const handleClick = async () => {
    if (disabled) return;
    setStatus('running');
    try {
      const response = await fetch(endpoint, { method: 'POST' });
      if (!response.ok) throw new Error('Queue action failed');
      setStatus('done');
      router.refresh();
      window.setTimeout(() => setStatus('idle'), 2200);
    } catch {
      setStatus('error');
      window.setTimeout(() => setStatus('idle'), 3000);
    }
  };

  const text =
    status === 'running'
      ? runningLabel
      : status === 'done'
        ? doneLabel
        : status === 'error'
          ? 'Action Failed'
          : disabled && disabledLabel
            ? disabledLabel
            : label;

  return (
    <button
      type="button"
      className="btn-primary gap-2 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={disabled || status === 'running'}
      onClick={handleClick}
    >
      <Icon size={15} />
      {text}
    </button>
  );
}
