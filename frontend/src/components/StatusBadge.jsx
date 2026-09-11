import React from 'react';

const STATUS_CONFIG = {
  new: {
    label: 'New Lead',
    bg: 'bg-zinc-800/80 text-zinc-300 border-zinc-700/60',
    dot: 'bg-zinc-400',
  },
  outreach_sent: {
    label: 'Outreach Sent',
    bg: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    dot: 'bg-amber-400',
  },
  ongoing: {
    label: 'Ongoing (Replied)',
    bg: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20',
    dot: 'bg-indigo-400 animate-pulse',
  },
  finalized: {
    label: 'Finalized',
    bg: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    dot: 'bg-emerald-400',
  },
  not_interested: {
    label: 'Not Interested',
    bg: 'bg-rose-500/10 text-rose-300 border-rose-500/20',
    dot: 'bg-rose-400',
  },
};

export default function StatusBadge({ status, className = '' }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.new;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.bg} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}
