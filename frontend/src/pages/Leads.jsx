import React, { useState, useEffect } from 'react';
import { leadsApi, messagingApi } from '../api/client';
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
  Star,
  Send,
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldCheck,
  Sparkles,
  Upload,
  FileSpreadsheet,
  FileText,
  Download
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

  // Bulk Selection & Dispatch State
  const [selectedLeadIds, setSelectedLeadIds] = useState(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkTemplate, setBulkTemplate] = useState('outreach_template_1');
  const [bulkCustomMode, setBulkCustomMode] = useState(false);
  const [bulkCustomTemplate, setBulkCustomTemplate] = useState('');
  const [bulkTopic, setBulkTopic] = useState('the website demo');
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null);
  const [bulkComplete, setBulkComplete] = useState(false);

  // File Import State (CSV / Excel)
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [dragActive, setDragActive] = useState(false);

  const fetchLeads = async () => {
    try {
      setLoading(true);
      const res = await leadsApi.list({
        status: statusFilter,
        search: search.trim() || undefined,
        limit: 100,
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

  // Bulk selection helpers
  const isAllSelected = leads.length > 0 && leads.every((l) => selectedLeadIds.has(l.id));
  const isSomeSelected = selectedLeadIds.size > 0 && !isAllSelected;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedLeadIds(new Set());
    } else {
      setSelectedLeadIds(new Set(leads.map((l) => l.id)));
    }
  };

  const toggleSelectOne = (id) => {
    const next = new Set(selectedLeadIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedLeadIds(next);
  };

  const selectAllNewLeads = () => {
    const newIds = leads.filter((l) => l.status === 'new').map((l) => l.id);
    setSelectedLeadIds(new Set(newIds));
  };

  const clearSelection = () => {
    setSelectedLeadIds(new Set());
  };

  const handleStartBulkSend = async () => {
    const templateToSend = (bulkCustomMode ? bulkCustomTemplate : bulkTemplate).trim();
    if (!templateToSend) {
      alert('Please select or enter a valid template name');
      return;
    }

    const ids = Array.from(selectedLeadIds);
    if (ids.length === 0) return;

    setBulkSending(true);
    setBulkComplete(false);
    setBulkProgress({
      current: 0,
      total: ids.length,
      successCount: 0,
      failCount: 0,
      logs: [],
    });

    const CHUNK_SIZE = 5;
    let successTotal = 0;
    let failTotal = 0;
    const allLogs = [];

    try {
      for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        const chunk = ids.slice(i, i + CHUNK_SIZE);
        const res = await messagingApi.sendBulkTemplate({
          lead_ids: chunk,
          template_name: templateToSend,
          follow_up_topic: bulkTopic,
          delay_min: 3.0,
          delay_max: 5.0,
        });

        const { sent, failed, results } = res.data;
        successTotal += sent;
        failTotal += failed;
        allLogs.push(...results);

        setBulkProgress({
          current: Math.min(i + CHUNK_SIZE, ids.length),
          total: ids.length,
          successCount: successTotal,
          failCount: failTotal,
          logs: [...allLogs],
        });
      }

      setBulkComplete(true);
      fetchLeads();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed during bulk dispatch');
    } finally {
      setBulkSending(false);
    }
  };

  // File import handlers (CSV / Excel)
  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setImportResult(null);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
      setImportResult(null);
    }
  };

  const handleUploadFile = async () => {
    if (!selectedFile || importing) return;
    setImporting(true);
    setImportResult(null);
    try {
      const res = await leadsApi.importFile(selectedFile);
      setImportResult(res.data);
      fetchLeads();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to import file');
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadSampleCsv = () => {
    const csvContent = "Name,Phone Number,Location,Rating\n" +
      "Acme Artisanal Coffee,+44 7712 345678,\"12 Baker Street, London\",4.9\n" +
      "The Rustic Bistro,+44 7890 123456,\"45 High Street, Manchester\",4.7\n";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "sample_leads.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
            onClick={() => {
              setSelectedFile(null);
              setImportResult(null);
              setShowImportModal(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium text-zinc-200 bg-zinc-800 hover:bg-zinc-700 transition-colors border border-zinc-700/80 shadow-sm"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-400" />
            Import CSV / Excel
          </button>
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

      {/* Quick Selection Shortcuts */}
      {leads.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-zinc-400">
          <div className="flex items-center gap-2">
            <span>Showing {leads.length} leads</span>
            {selectedLeadIds.size > 0 && (
              <span className="text-emerald-400 font-medium">
                ({selectedLeadIds.size} selected)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleSelectAll}
              className="text-[11px] text-zinc-400 hover:text-zinc-200 underline"
            >
              {isAllSelected ? 'Deselect all visible' : 'Select all visible'}
            </button>
            {leads.some((l) => l.status === 'new') && (
              <>
                <span className="text-zinc-600">•</span>
                <button
                  onClick={selectAllNewLeads}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium"
                >
                  Select all New ({leads.filter((l) => l.status === 'new').length})
                </button>
              </>
            )}
            {selectedLeadIds.size > 0 && (
              <>
                <span className="text-zinc-600">•</span>
                <button
                  onClick={clearSelection}
                  className="text-[11px] text-rose-400 hover:text-rose-300 font-medium"
                >
                  Clear Selection
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Leads Table */}
      <div className="border border-zinc-800/80 rounded-xl bg-zinc-900/30 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/60 text-zinc-400 font-medium">
                <th className="py-3 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = isSomeSelected;
                    }}
                    onChange={toggleSelectAll}
                    className="rounded border-zinc-700 bg-zinc-950 text-emerald-500 focus:ring-0 focus:ring-offset-0 cursor-pointer h-4 w-4"
                    title={isAllSelected ? 'Deselect all' : 'Select all visible leads'}
                  />
                </th>
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
                  <td colSpan={6} className="py-12 text-center text-zinc-500">
                    <div className="w-5 h-5 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mx-auto mb-2" />
                    Loading leads...
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-zinc-500">
                    No leads found in this stage. Use the <strong className="text-emerald-400">AI Lead Finder</strong> to discover prospective businesses!
                  </td>
                </tr>
              ) : (
                leads.map((lead) => {
                  const isSelected = selectedLeadIds.has(lead.id);
                  return (
                    <tr 
                      key={lead.id} 
                      className={`transition-colors ${isSelected ? 'bg-emerald-950/20 hover:bg-emerald-950/30' : 'hover:bg-zinc-800/20'}`}
                    >
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(lead.id)}
                          className="rounded border-zinc-700 bg-zinc-950 text-emerald-500 focus:ring-0 focus:ring-offset-0 cursor-pointer h-4 w-4"
                        />
                      </td>
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
                  );
                })
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

      {/* Floating Bulk Action Bar */}
      {selectedLeadIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-zinc-900/95 border border-zinc-700/80 shadow-2xl backdrop-blur-md rounded-2xl px-5 py-3 flex items-center gap-4 text-xs text-zinc-200 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold text-zinc-100">{selectedLeadIds.size}</span>
            <span className="text-zinc-400">leads selected</span>
          </div>

          <div className="h-4 w-px bg-zinc-700" />

          <button
            onClick={() => {
              setBulkProgress(null);
              setBulkComplete(false);
              setShowBulkModal(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium text-white bg-emerald-600 hover:bg-emerald-500 transition-colors shadow-md"
          >
            <Send className="w-3.5 h-3.5" />
            Send Bulk Outreach Template
          </button>

          <button
            onClick={clearSelection}
            className="text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded hover:bg-zinc-800 transition-colors"
          >
            Deselect All
          </button>
        </div>
      )}

      {/* Bulk Outreach Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4 shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <Send className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-zinc-100">Bulk WhatsApp Outreach</h2>
                  <p className="text-xs text-zinc-400">
                    Dispatching to <strong className="text-emerald-400">{selectedLeadIds.size}</strong> selected leads
                  </p>
                </div>
              </div>
              {!bulkSending && (
                <button
                  onClick={() => setShowBulkModal(false)}
                  className="text-zinc-500 hover:text-zinc-300 p-1 rounded-md"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="space-y-4 overflow-y-auto pr-1 flex-1">
              {!bulkSending && !bulkComplete && (
                <>
                  {/* Template Picker */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <label className="font-medium text-zinc-300">Select Outreach Template</label>
                      <button
                        type="button"
                        onClick={() => setBulkCustomMode(!bulkCustomMode)}
                        className="text-emerald-400 hover:text-emerald-300 text-[11px] underline"
                      >
                        {bulkCustomMode ? '← Back to Presets' : '＋ Type custom template'}
                      </button>
                    </div>

                    {bulkCustomMode ? (
                      <input
                        type="text"
                        value={bulkCustomTemplate}
                        onChange={(e) => setBulkCustomTemplate(e.target.value)}
                        placeholder="e.g. initial_outreach (approved in Meta)"
                        className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500/50"
                      />
                    ) : (
                      <select
                        value={bulkTemplate}
                        onChange={(e) => {
                          if (e.target.value === '__custom__') {
                            setBulkCustomMode(true);
                          } else {
                            setBulkTemplate(e.target.value);
                          }
                        }}
                        className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 rounded-lg px-3 py-2 focus:outline-none"
                      >
                        <option value="outreach_template_1">{'outreach_template_1 — "Custom Website for {{1}}"'}</option>
                        <option value="outreach_follow_up_1">{'outreach_follow_up_1 — "Just bumping this up..."'}</option>
                        <option value="outreach_follow_up_2">{'outreach_follow_up_2 — "Follow Up regarding {{1}}"'}</option>
                        <option value="initial_outreach">{'initial_outreach — "Hello {{1}}, we discovered your business..."'}</option>
                        <option value="partnership_offer">{'partnership_offer — "Hi {{1}}, quick partnership inquiry..."'}</option>
                        <option value="__custom__">＋ Type custom template name...</option>
                      </select>
                    )}
                  </div>

                  {/* Dynamic Template Context */}
                  {bulkTemplate === 'outreach_template_1' && !bulkCustomMode && (
                    <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-800/40 text-xs space-y-1">
                      <div className="font-semibold flex items-center gap-1.5 text-emerald-300">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                        Automated Personalization Enabled
                      </div>
                      <p className="text-zinc-400 text-[11px] leading-relaxed">
                        Each lead will automatically receive their exact <strong>Business Name</strong> in Header and Body, plus their actual <strong>Google Star Rating</strong> in Body (defaults to 4.8 if unrated).
                      </p>
                    </div>
                  )}

                  {bulkTemplate === 'outreach_follow_up_1' && !bulkCustomMode && (
                    <div className="p-3 rounded-xl bg-zinc-800/40 border border-zinc-700/50 text-xs text-zinc-300">
                      <div className="font-semibold text-zinc-200">Static Follow-up Template</div>
                      <p className="text-zinc-400 text-[11px] mt-0.5">
                        Dispatched with 0 parameters directly to each selected prospect.
                      </p>
                    </div>
                  )}

                  {bulkTemplate === 'outreach_follow_up_2' && !bulkCustomMode && (
                    <div className="space-y-1.5 p-3 rounded-xl bg-zinc-800/40 border border-zinc-700/50 text-xs">
                      <label className="text-[11px] text-zinc-300 block font-medium">
                        Topic / Subject (Header & Body: "regarding {'{{1}}'}")
                      </label>
                      <input
                        type="text"
                        value={bulkTopic}
                        onChange={(e) => setBulkTopic(e.target.value)}
                        placeholder="e.g. the website demo, our website mockup"
                        className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500/50 text-xs"
                      />
                    </div>
                  )}

                  {/* Anti-Spam Rate Pacing Notice */}
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80 text-xs">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <span className="text-zinc-200 font-medium">Anti-Spam Human Pacing (3.0s – 5.0s):</span>
                      <p className="text-[11px] text-zinc-400 leading-relaxed">
                        Messages are dispatched with a natural randomized delay (3 to 5 seconds per lead) to protect your WhatsApp Business number from automated rate detection and spam limits.
                        Estimated duration for {selectedLeadIds.size} leads: ~{Math.ceil((selectedLeadIds.size * 4) / 60)} minutes.
                      </p>
                    </div>
                  </div>
                </>
              )}

              {/* Progress and Live Dispatch View */}
              {bulkProgress && (
                <div className="space-y-3.5 p-4 rounded-xl bg-zinc-950/80 border border-zinc-800/80">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-zinc-200">
                      {bulkComplete ? '🎉 Bulk Dispatch Complete!' : 'Dispatching in progress...'}
                    </span>
                    <span className="text-zinc-400 font-mono">
                      {bulkProgress.current} / {bulkProgress.total} ({Math.round((bulkProgress.current / bulkProgress.total) * 100)}%)
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-2.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-300 rounded-full ${bulkComplete ? 'bg-emerald-500' : 'bg-emerald-500 animate-pulse'}`}
                      style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                    />
                  </div>

                  {/* Counters */}
                  <div className="flex items-center gap-4 text-xs font-mono">
                    <div className="text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {bulkProgress.successCount} sent
                    </div>
                    {bulkProgress.failCount > 0 && (
                      <div className="text-rose-400 flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5" />
                        {bulkProgress.failCount} failed
                      </div>
                    )}
                    {!bulkComplete && (
                      <div className="text-zinc-500 flex items-center gap-1.5 ml-auto text-[11px]">
                        <Clock className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                        Pacing delay active...
                      </div>
                    )}
                  </div>

                  {/* Live Activity Log */}
                  <div className="max-h-48 overflow-y-auto space-y-1.5 p-2.5 bg-zinc-900/60 rounded-xl text-[11px] font-mono border border-zinc-800/50">
                    {bulkProgress.logs.map((log, i) => (
                      <div key={i} className={`flex items-center justify-between py-0.5 border-b border-zinc-800/30 last:border-0 ${log.success ? 'text-zinc-300' : 'text-rose-400'}`}>
                        <span className="truncate max-w-[300px]">
                          {log.business_name} <span className="text-zinc-500">({log.phone_number})</span>
                        </span>
                        <span className={log.success ? 'text-emerald-400 shrink-0 font-medium' : 'text-rose-400 shrink-0 font-medium'}>
                          {log.success ? '✓ Sent' : `✗ ${log.error || 'Failed'}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800/80">
              {!bulkSending && !bulkComplete && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowBulkModal(false)}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleStartBulkSend}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Start Bulk Dispatch ({selectedLeadIds.size})
                  </button>
                </>
              )}

              {bulkSending && (
                <div className="flex items-center gap-2 text-xs text-zinc-400 py-1">
                  <div className="w-3.5 h-3.5 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                  <span>Dispatching messages safely with rate pacing...</span>
                </div>
              )}

              {bulkComplete && (
                <button
                  type="button"
                  onClick={() => {
                    setShowBulkModal(false);
                    clearSelection();
                  }}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition-colors"
                >
                  Done & Refresh Pipeline
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Import CSV / Excel Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <Upload className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-zinc-100">Import Leads from Spreadsheet</h2>
                  <p className="text-xs text-zinc-400">Upload your CSV or Excel (.xlsx) file</p>
                </div>
              </div>
              {!importing && (
                <button
                  onClick={() => setShowImportModal(false)}
                  className="text-zinc-500 hover:text-zinc-300 p-1 rounded-md"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Expected Fields Banner */}
            <div className="p-3.5 rounded-xl bg-zinc-950/70 border border-zinc-800 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-zinc-200">Spreadsheet Columns:</span>
                <button
                  type="button"
                  onClick={handleDownloadSampleCsv}
                  className="text-emerald-400 hover:text-emerald-300 text-[11px] flex items-center gap-1 font-medium"
                >
                  <Download className="w-3 h-3" />
                  Download Sample CSV
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-[11px] font-mono">
                <div className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-700/60 text-emerald-400 font-semibold">
                  Name
                </div>
                <div className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-700/60 text-emerald-400 font-semibold">
                  Phone Number
                </div>
                <div className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-700/60 text-emerald-400 font-semibold">
                  Location
                </div>
                <div className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-700/60 text-emerald-400 font-semibold">
                  Rating
                </div>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Supports numeric rating (e.g. 4.8 or 5.0) for personalized outreach templates. Phone numbers are automatically verified and converted to international format.
              </p>
            </div>

            {/* Upload Box / Drag & Drop */}
            {!importResult && (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-6 text-center transition-all ${
                  dragActive
                    ? 'border-emerald-500 bg-emerald-500/5'
                    : selectedFile
                    ? 'border-emerald-500/50 bg-zinc-950'
                    : 'border-zinc-800 hover:border-zinc-700 bg-zinc-950/50'
                }`}
              >
                <input
                  type="file"
                  id="lead-file-input"
                  accept=".csv, .xlsx, .xls, text/csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {selectedFile ? (
                  <div className="space-y-2">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-zinc-200">{selectedFile.name}</div>
                      <div className="text-[11px] text-zinc-500 font-mono">
                        {(selectedFile.size / 1024).toFixed(1)} KB
                      </div>
                    </div>
                    {!importing && (
                      <label
                        htmlFor="lead-file-input"
                        className="inline-block text-[11px] text-emerald-400 hover:text-emerald-300 cursor-pointer underline"
                      >
                        Choose another file
                      </label>
                    )}
                  </div>
                ) : (
                  <label htmlFor="lead-file-input" className="cursor-pointer space-y-2 block">
                    <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 flex items-center justify-center mx-auto">
                      <Upload className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-medium text-zinc-300">
                        Drop your CSV or Excel file here, or <span className="text-emerald-400 underline">browse</span>
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-0.5">Supports .csv, .xlsx, .xls</div>
                    </div>
                  </label>
                )}
              </div>
            )}

            {/* Results Feedback Card */}
            {importResult && (
              <div className="space-y-3 p-4 rounded-xl bg-zinc-950/90 border border-zinc-800">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  Import Finished!
                </div>
                <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                  <div className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800/80">
                    <div className="text-[10px] text-zinc-400">Imported into Pipeline</div>
                    <div className="text-lg font-bold text-emerald-400">+{importResult.imported_count}</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800/80">
                    <div className="text-[10px] text-zinc-400">Skipped (Duplicates/Invalid)</div>
                    <div className="text-lg font-bold text-zinc-400">{importResult.skipped_count}</div>
                  </div>
                </div>

                {importResult.errors && importResult.errors.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[10px] font-medium text-zinc-400">Details / Skipped Rows:</div>
                    <div className="max-h-28 overflow-y-auto space-y-1 p-2 bg-zinc-900/60 rounded-lg text-[10px] font-mono text-zinc-400 border border-zinc-800/50">
                      {importResult.errors.map((err, i) => (
                        <div key={i} className="truncate">{err}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800/80">
              {!importResult ? (
                <>
                  <button
                    type="button"
                    onClick={() => setShowImportModal(false)}
                    disabled={importing}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleUploadFile}
                    disabled={!selectedFile || importing}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition-colors disabled:opacity-50"
                  >
                    {importing ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        Importing leads...
                      </>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5" />
                        Import Leads
                      </>
                    )}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition-colors"
                >
                  Done & View Leads
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

