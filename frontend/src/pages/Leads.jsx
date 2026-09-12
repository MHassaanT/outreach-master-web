import React, { useState, useEffect } from 'react';
import { leadsApi } from '../api/client';
import StatusBadge from '../components/StatusBadge';
import { 
  Users, 
  Search, 
  Plus, 
  Trash2, 
  MessageSquare, 
  ExternalLink, 
  RefreshCw,
  X,
  Star
} from 'lucide-react';

export default function Leads({ setActiveTab, setSelectedLeadId }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newLead, setNewLead] = useState({
    business_name: '',
    phone_number: '',
    address: '',
    rating: '',
    notes: '',
  });

  const fetchLeads = async () => {
    try {
      setLoading(true);
      const res = await leadsApi.list({
        status: statusFilter,
        search: search.trim() || undefined,
      });
      setLeads(res.data);
    } catch (err) {
      console.error('Failed to load leads:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, [statusFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchLeads();
  };

  const handleStatusChange = async (leadId, newStatus) => {
    try {
      await leadsApi.updateStatus(leadId, newStatus);
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l))
      );
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const handleDeleteLead = async (leadId) => {
    if (!window.confirm('Are you sure you want to delete this lead?')) return;
    try {
      await leadsApi.delete(leadId);
      setLeads((prev) => prev.filter((l) => l.id !== leadId));
    } catch (err) {
      console.error('Failed to delete lead:', err);
    }
  };

  const handleCreateLead = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...newLead,
        rating: newLead.rating ? parseFloat(newLead.rating) : null,
      };
      await leadsApi.create(payload);
      setShowAddModal(false);
      setNewLead({ business_name: '', phone_number: '', address: '', rating: '', notes: '' });
      fetchLeads();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to create lead');
    }
  };

  const statusTabs = [
    { id: 'all', label: 'All Leads' },
    { id: 'new', label: 'New' },
    { id: 'outreach_sent', label: 'Outreach Sent' },
    { id: 'ongoing', label: 'Ongoing (Replied)' },
    { id: 'finalized', label: 'Finalized' },
    { id: 'not_interested', label: 'Not Interested' },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto py-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Leads Pipeline</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Manage prospects, update status stages, and initiate WhatsApp conversations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Lead Manually
          </button>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 pb-2 border-b border-zinc-800">
        <div className="flex items-center gap-1 overflow-x-auto pb-2 md:pb-0">
          {statusTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                statusFilter === tab.id
                  ? 'bg-zinc-800 text-zinc-100 border border-zinc-700/80 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Search business or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700 w-56"
            />
          </div>
          <button
            type="submit"
            className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-md border border-zinc-800 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>

      {/* Leads Table */}
      <div className="border border-zinc-800/80 rounded-xl bg-zinc-900/30 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/60 text-zinc-400 font-medium">
                <th className="py-3 px-4">Business</th>
                <th className="py-3 px-4">Phone Number</th>
                <th className="py-3 px-4">Rating</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-zinc-500">
                    <div className="w-5 h-5 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mx-auto mb-2" />
                    Loading leads...
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-zinc-500">
                    No leads found in this stage. Use the <strong className="text-emerald-400">AI Lead Finder</strong> to discover prospective businesses!
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-zinc-800/20 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-medium text-zinc-200">{lead.business_name}</div>
                      <div className="text-[11px] text-zinc-500 truncate max-w-xs">{lead.address || 'No address'}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-mono text-zinc-300">{lead.formatted_phone || lead.phone_number}</div>
                      <div className="text-[10px] text-indigo-400">Mobile Verified</div>
                    </td>
                    <td className="py-3 px-4">
                      {lead.rating ? (
                        <div className="flex items-center gap-1 font-mono text-zinc-300">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          {lead.rating}
                        </div>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <select
                        value={lead.status}
                        onChange={(e) => handleStatusChange(lead.id, e.target.value)}
                        className="bg-zinc-900 border border-zinc-800 text-zinc-300 rounded px-2 py-1 text-xs focus:outline-none focus:border-zinc-700"
                      >
                        <option value="new">New Lead</option>
                        <option value="outreach_sent">Outreach Sent</option>
                        <option value="ongoing">Ongoing (Replied)</option>
                        <option value="finalized">Finalized</option>
                        <option value="not_interested">Not Interested</option>
                      </select>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setSelectedLeadId(lead.id);
                            setActiveTab('messaging');
                          }}
                          className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium transition-colors"
                          title="Message on WhatsApp"
                        >
                          <MessageSquare className="w-3 h-3 text-emerald-400" />
                          Chat
                        </button>
                        <button
                          onClick={() => handleDeleteLead(lead.id)}
                          className="p-1 text-zinc-500 hover:text-rose-400 rounded transition-colors"
                          title="Delete Lead"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Lead Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-zinc-100">Add Lead Manually</h2>
              <button onClick={() => setShowAddModal(false)} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateLead} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Business Name *</label>
                <input
                  type="text"
                  required
                  value={newLead.business_name}
                  onChange={(e) => setNewLead({ ...newLead, business_name: e.target.value })}
                  placeholder="e.g. Acme Coffee Roasters"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Phone Number (Mobile) *</label>
                <input
                  type="text"
                  required
                  value={newLead.phone_number}
                  onChange={(e) => setNewLead({ ...newLead, phone_number: e.target.value })}
                  placeholder="e.g. +44 7712 345678"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Google Star Rating (e.g. 4.8)</label>
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  max="5"
                  value={newLead.rating}
                  onChange={(e) => setNewLead({ ...newLead, rating: e.target.value })}
                  placeholder="e.g. 4.8"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Address</label>
                <input
                  type="text"
                  value={newLead.address}
                  onChange={(e) => setNewLead({ ...newLead, address: e.target.value })}
                  placeholder="e.g. 10 High Street, City"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Notes</label>
                <textarea
                  value={newLead.notes}
                  onChange={(e) => setNewLead({ ...newLead, notes: e.target.value })}
                  rows={3}
                  placeholder="Additional context..."
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-md text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm"
                >
                  Create Lead
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
