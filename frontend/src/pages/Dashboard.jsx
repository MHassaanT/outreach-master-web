import React, { useState, useEffect } from 'react';
import { dashboardApi } from '../api/client';
import StatusBadge from '../components/StatusBadge';
import { 
  Users, 
  Send, 
  MessageSquare, 
  CheckCircle2, 
  TrendingUp, 
  ArrowUpRight, 
  Sparkles,
  RefreshCw,
  Clock
} from 'lucide-react';

export default function Dashboard({ setActiveTab, setSelectedLeadId }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = async () => {
    try {
      const res = await dashboardApi.getStats();
      setStats(res.data);
    } catch (err) {
      console.error('Failed to load dashboard stats:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchStats();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  const metrics = stats?.metrics || {
    total_leads: 0,
    new_leads: 0,
    outreach_sent: 0,
    ongoing_conversations: 0,
    finalized: 0,
    response_rate: 0,
  };

  const cards = [
    {
      title: 'Total Leads Found',
      value: metrics.total_leads,
      subtext: `${metrics.new_leads} pending outreach`,
      icon: Users,
      action: () => setActiveTab('leads'),
    },
    {
      title: 'Outreach Dispatched',
      value: metrics.outreach_sent,
      subtext: 'Cold templates sent',
      icon: Send,
      action: () => setActiveTab('messaging'),
    },
    {
      title: 'Ongoing Conversations',
      value: metrics.ongoing_conversations,
      subtext: 'Leads that replied',
      icon: MessageSquare,
      highlight: true,
      action: () => setActiveTab('messaging'),
    },
    {
      title: 'Finalized Deals',
      value: metrics.finalized,
      subtext: 'Conversions achieved',
      icon: CheckCircle2,
      action: () => setActiveTab('leads'),
    },
  ];

  return (
    <div className="space-y-8 max-w-7xl mx-auto py-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Outreach Dashboard</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Real-time pipeline metrics, WhatsApp engagement, and conversion performance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-900 border border-zinc-800 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setActiveTab('agent')}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 transition-colors shadow-sm shadow-emerald-950"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Find New Leads
          </button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card, i) => {
          const Icon = card.icon;
          return (
            <div
              key={i}
              onClick={card.action}
              className={`cursor-pointer p-5 rounded-xl border transition-all duration-200 hover:border-zinc-700 bg-zinc-900/40 backdrop-blur-sm ${
                card.highlight
                  ? 'border-indigo-500/30 ring-1 ring-indigo-500/20'
                  : 'border-zinc-800/80'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-400">{card.title}</span>
                <div className={`p-2 rounded-lg ${card.highlight ? 'bg-indigo-500/10 text-indigo-400' : 'bg-zinc-800/60 text-zinc-400'}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl font-semibold tracking-tight text-zinc-100">{card.value}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
                <span>{card.subtext}</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Conversion Banner & Quick Stats */}
      <div className="p-6 rounded-xl border border-zinc-800/80 bg-zinc-900/30 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-semibold text-zinc-100">{metrics.response_rate}%</span>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Response & Conversion Rate
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              {metrics.ongoing_conversations + metrics.finalized} replied or finalized out of {metrics.outreach_sent + metrics.ongoing_conversations + metrics.finalized} leads contacted.
            </p>
          </div>
        </div>

        {/* Pipeline Bar */}
        <div className="w-full md:w-80 space-y-2">
          <div className="flex justify-between text-[11px] text-zinc-400 font-mono">
            <span>Progress Funnel</span>
            <span>{metrics.finalized} Closed</span>
          </div>
          <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden flex">
            <div 
              style={{ width: `${metrics.total_leads ? (metrics.new_leads / metrics.total_leads) * 100 : 0}%` }} 
              className="bg-zinc-600 transition-all" 
              title={`New: ${metrics.new_leads}`}
            />
            <div 
              style={{ width: `${metrics.total_leads ? (metrics.outreach_sent / metrics.total_leads) * 100 : 0}%` }} 
              className="bg-amber-500 transition-all" 
              title={`Sent: ${metrics.outreach_sent}`}
            />
            <div 
              style={{ width: `${metrics.total_leads ? (metrics.ongoing_conversations / metrics.total_leads) * 100 : 0}%` }} 
              className="bg-indigo-500 transition-all" 
              title={`Ongoing: ${metrics.ongoing_conversations}`}
            />
            <div 
              style={{ width: `${metrics.total_leads ? (metrics.finalized / metrics.total_leads) * 100 : 0}%` }} 
              className="bg-emerald-500 transition-all" 
              title={`Finalized: ${metrics.finalized}`}
            />
          </div>
          <div className="flex justify-between text-[10px] text-zinc-500">
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-zinc-600" /> New</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Sent</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-indigo-500" /> Ongoing</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Finalized</span>
          </div>
        </div>
      </div>

      {/* Recent Activity Stream */}
      <div className="border border-zinc-800/80 rounded-xl bg-zinc-900/30 overflow-hidden">
        <div className="p-4 border-b border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-zinc-400" />
            <h2 className="text-sm font-semibold text-zinc-200">Recent WhatsApp Activity</h2>
          </div>
          <button
            onClick={() => setActiveTab('messaging')}
            className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            Open Messaging Hub →
          </button>
        </div>

        <div className="divide-y divide-zinc-800/60">
          {stats?.recent_activities && stats.recent_activities.length > 0 ? (
            stats.recent_activities.map((act) => (
              <div 
                key={act.id} 
                onClick={() => {
                  setSelectedLeadId(act.lead_id);
                  setActiveTab('messaging');
                }}
                className="p-4 flex items-center justify-between hover:bg-zinc-800/30 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold ${
                    act.direction === 'inbound' 
                      ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/20' 
                      : 'bg-zinc-800 text-zinc-400'
                  }`}>
                    {act.direction === 'inbound' ? 'IN' : 'OUT'}
                  </div>
                  <div>
                    <span className="text-xs font-medium text-zinc-200">{act.business_name}</span>
                    <p className="text-[11px] text-zinc-400 mt-0.5">{act.content}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-mono text-zinc-500">
                    {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <div className="text-[10px] text-zinc-400 uppercase tracking-wider">{act.status}</div>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-xs text-zinc-500">
              No recent WhatsApp messages dispatched yet. Use the AI Lead Finder to source leads and send outreach!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
