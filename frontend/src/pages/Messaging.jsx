import React, { useState, useEffect, useRef } from 'react';
import { messagingApi, leadsApi, simulatorApi } from '../api/client';
import StatusBadge from '../components/StatusBadge';
import EmbeddedSignupModal from '../components/EmbeddedSignupModal';
import { 
  Send, 
  Phone, 
  Clock, 
  Check, 
  CheckCheck, 
  AlertCircle, 
  Sparkles, 
  Search, 
  CheckCircle2, 
  MessageSquare, 
  Play, 
  FileText,
  Building2,
  MapPin,
  Star,
  Smartphone,
  QrCode,
  RefreshCw
} from 'lucide-react';

export default function Messaging({ selectedLeadId, setSelectedLeadId }) {
  const [threads, setThreads] = useState([]);
  const [activeThread, setActiveThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [showEmbeddedModal, setShowEmbeddedModal] = useState(false);
  const [syncingThreads, setSyncingThreads] = useState(false);

  // Composer
  const [messageText, setMessageText] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('outreach_template_1');
  const [customTemplateMode, setCustomTemplateMode] = useState(false);
  const [customTemplateName, setCustomTemplateName] = useState('');
  const [templateBusinessName, setTemplateBusinessName] = useState('');
  const [templateRating, setTemplateRating] = useState('4.8');
  const [sending, setSending] = useState(false);

  // Simulator
  const [showSimulator, setShowSimulator] = useState(false);
  const [simReplyText, setSimReplyText] = useState('');

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Fetch threads
  const fetchThreads = async () => {
    try {
      const res = await messagingApi.getThreads({ filter_status: filterStatus });
      setThreads(res.data);

      // If selectedLeadId is passed or none selected, pick the first
      if (res.data.length > 0) {
        if (selectedLeadId) {
          const match = res.data.find((t) => t.lead_id === selectedLeadId);
          if (match) setActiveThread(match);
        } else if (!activeThread) {
          setActiveThread(res.data[0]);
          setSelectedLeadId(res.data[0].lead_id);
        }
      }
    } catch (err) {
      console.error('Failed to load threads:', err);
    } finally {
      setLoadingThreads(false);
    }
  };

  const handleSyncThreads = async () => {
    try {
      setSyncingThreads(true);
      const res = await messagingApi.syncThreads();
      await fetchThreads();
      if (activeThread) {
        await fetchThreadMessages(activeThread.lead_id);
      }
      if (res.data?.merged_duplicates_count > 0) {
        alert(`Successfully synchronized threads! Consolidated ${res.data.merged_duplicates_count} split thread(s).`);
      }
    } catch (err) {
      console.error('Failed to sync threads:', err);
    } finally {
      setSyncingThreads(false);
    }
  };

  useEffect(() => {
    fetchThreads();
  }, [filterStatus]);

  // Fetch messages for active thread
  const fetchThreadMessages = async (leadId) => {
    if (!leadId) return;
    try {
      setLoadingMessages(true);
      const res = await messagingApi.getThreadMessages(leadId);
      setMessages(res.data.messages);
      // Also update activeThread lead details
      setActiveThread((prev) => ({ ...prev, ...res.data.lead, lead_id: res.data.lead.id }));
    } catch (err) {
      console.error('Failed to load thread messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    if (activeThread?.lead_id) {
      fetchThreadMessages(activeThread.lead_id);
    }
  }, [activeThread?.lead_id]);

  useEffect(() => {
    if (activeThread) {
      setTemplateBusinessName(activeThread.business_name || '');
      setTemplateRating(activeThread.rating ? String(activeThread.rating) : '4.8');
    }
  }, [activeThread?.lead_id, activeThread?.business_name, activeThread?.rating]);

  const handleSelectThread = (thread) => {
    setActiveThread(thread);
    setSelectedLeadId(thread.lead_id);
  };

  const handleSendText = async (e) => {
    e.preventDefault();
    if (!messageText.trim() || !activeThread || sending) return;

    setSending(true);
    try {
      const res = await messagingApi.sendText(activeThread.lead_id, messageText);
      setMessages((prev) => [...prev, res.data.message]);
      setMessageText('');
      fetchThreads(); // Refresh thread preview
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to send text message');
    } finally {
      setSending(false);
    }
  };

  const handleSendTemplate = async () => {
    if (!activeThread || sending) return;

    const templateToSend = (customTemplateMode ? customTemplateName : selectedTemplate).trim();
    if (!templateToSend) {
      alert('Please enter or select a valid Meta template name');
      return;
    }

    setSending(true);
    try {
      const lang = templateToSend === 'hello_world' ? 'en_US' : 'en';
      let params;
      if (templateToSend === 'hello_world' || templateToSend === 'outreach_follow_up_1') {
        params = [];
      } else if (templateToSend === 'outreach_template_1') {
        params = [templateRating.trim() || '4.8', templateBusinessName.trim() || activeThread.business_name];
      } else {
        params = [templateBusinessName.trim() || activeThread.business_name];
      }

      const res = await messagingApi.sendTemplate(
        activeThread.lead_id,
        templateToSend,
        lang,
        params
      );
      setMessages((prev) => [...prev, res.data.message]);
      fetchThreads(); // Refresh thread status
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to send template message');
    } finally {
      setSending(false);
    }
  };

  const handleUpdateStatus = async (newStatus) => {
    if (!activeThread) return;
    try {
      await leadsApi.updateStatus(activeThread.lead_id, newStatus);
      setActiveThread((prev) => ({ ...prev, status: newStatus }));
      setThreads((prev) =>
        prev.map((t) => (t.lead_id === activeThread.lead_id ? { ...t, status: newStatus } : t))
      );
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  // Simulator actions
  const handleSimulateReply = async () => {
    if (!activeThread) return;
    try {
      const res = await simulatorApi.simulateReply(activeThread.lead_id, simReplyText);
      setMessages((prev) => [...prev, res.data.message]);
      setActiveThread((prev) => ({
        ...prev,
        status: 'ongoing',
        window_active: true,
        window_seconds_left: 24 * 3600
      }));
      fetchThreads();
    } catch (err) {
      console.error('Simulator reply error:', err);
    }
  };

  const handleSimulateRead = async () => {
    if (!activeThread) return;
    try {
      await simulatorApi.simulateRead(activeThread.lead_id);
      fetchThreadMessages(activeThread.lead_id);
    } catch (err) {
      console.error('Simulator read error:', err);
    }
  };

  const filteredThreads = threads.filter((t) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      t.business_name.toLowerCase().includes(term) ||
      t.phone_number.toLowerCase().includes(term)
    );
  });

  return (
    <div className="h-[calc(100vh-6.5rem)] flex border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/30">
      {/* Left Pane: Threads List */}
      <div className="w-80 md:w-96 border-r border-zinc-800 flex flex-col bg-zinc-950/60">
        {/* Header & Search */}
        <div className="p-3 border-b border-zinc-800 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <h2 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
                WhatsApp Threads ({threads.length})
              </h2>
              <button
                onClick={handleSyncThreads}
                disabled={syncingThreads}
                title="Consolidate & sync split threads"
                className="p-1 rounded text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800 transition-colors"
              >
                <RefreshCw className={`w-3 h-3 ${syncingThreads ? 'animate-spin text-emerald-400' : ''}`} />
              </button>
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300 rounded px-2 py-0.5"
            >
              <option value="all">All</option>
              <option value="ongoing">Ongoing</option>
              <option value="outreach_sent">Sent</option>
              <option value="finalized">Finalized</option>
            </select>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
            />
          </div>
        </div>

        {/* Thread List */}
        <div className="flex-1 overflow-y-auto divide-y divide-zinc-900">
          {loadingThreads ? (
            <div className="p-8 text-center text-xs text-zinc-500">Loading threads...</div>
          ) : filteredThreads.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-500">
              No conversations found. Add leads from the AI Lead Finder to start messaging.
            </div>
          ) : (
            filteredThreads.map((thread) => {
              const isSelected = activeThread?.lead_id === thread.lead_id;
              return (
                <div
                  key={thread.lead_id}
                  onClick={() => handleSelectThread(thread)}
                  className={`p-3 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-zinc-800/80 border-l-2 border-emerald-500'
                      : 'hover:bg-zinc-900/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <span className="text-xs font-medium text-zinc-100 truncate">
                      {thread.business_name}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                      {thread.last_message
                        ? new Date(thread.last_message.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : ''}
                    </span>
                  </div>

                  <div className="text-[11px] text-zinc-400 truncate mb-1.5">
                    {thread.last_message?.content || (
                      <span className="italic text-zinc-600">No messages dispatched yet</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <StatusBadge status={thread.status} />
                    {thread.window_active && (
                      <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                        <Clock className="w-2.5 h-2.5" /> 24h Window
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Pane: Active Thread Chat Canvas */}
      {activeThread ? (
        <div className="flex-1 flex flex-col bg-zinc-950/40">
          {/* Active Thread Header */}
          <div className="p-4 border-b border-zinc-800 bg-zinc-900/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-zinc-100">{activeThread.business_name}</h2>
                <span className="text-xs font-mono text-emerald-400 font-medium">
                  {activeThread.formatted_phone || activeThread.phone_number}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                <MapPin className="w-3 h-3 text-zinc-500" />
                <span className="truncate max-w-sm">{activeThread.address || 'Address not listed'}</span>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowEmbeddedModal(true)}
                className="px-2.5 py-1 rounded text-xs font-medium bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 transition-colors"
                title="Link WhatsApp Business Mobile App via Meta Coexistence"
              >
                <Smartphone className="w-3 h-3 text-emerald-400" />
                Pair Phone
              </button>

              <button
                onClick={() => setShowSimulator(!showSimulator)}
                className="px-2.5 py-1 rounded text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 flex items-center gap-1"
                title="Open WhatsApp testing simulator"
              >
                <Play className="w-3 h-3 text-amber-400" />
                Simulator
              </button>

              <select
                value={activeThread.status}
                onChange={(e) => handleUpdateStatus(e.target.value)}
                className="bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 rounded px-2.5 py-1 focus:outline-none"
              >
                <option value="new">New</option>
                <option value="outreach_sent">Outreach Sent</option>
                <option value="ongoing">Ongoing (Replied)</option>
                <option value="finalized">Finalized</option>
                <option value="not_interested">Not Interested</option>
              </select>

              {activeThread.status !== 'finalized' && (
                <button
                  onClick={() => handleUpdateStatus('finalized')}
                  className="px-3 py-1 rounded text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1 transition-colors shadow-sm"
                >
                  <CheckCircle2 className="w-3 h-3" />
                  Mark Finalized
                </button>
              )}
            </div>
          </div>

          {/* Simulator Bar (Collapsible) */}
          {showSimulator && (
            <div className="p-3 bg-amber-500/10 border-b border-amber-500/20 text-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-amber-300">
                <Play className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Simulate incoming WhatsApp message from this lead:</span>
              </div>
              <div className="flex items-center gap-2 flex-1 max-w-md">
                <input
                  type="text"
                  value={simReplyText}
                  onChange={(e) => setSimReplyText(e.target.value)}
                  placeholder="Type reply message e.g. Thanks, tell me more..."
                  className="flex-1 px-2.5 py-1 rounded bg-zinc-900 border border-amber-500/30 text-zinc-200 text-xs focus:outline-none"
                />
                <button
                  onClick={handleSimulateReply}
                  className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-medium rounded text-xs whitespace-nowrap transition-colors"
                >
                  Receive Reply
                </button>
                <button
                  onClick={handleSimulateRead}
                  className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs whitespace-nowrap border border-zinc-700"
                  title="Mark latest outbound message as read"
                >
                  Read Ticks
                </button>
              </div>
            </div>
          )}

          {/* 24h Customer Service Window Notice */}
          <div className="px-4 py-2 border-b border-zinc-800/60 bg-zinc-900/20 flex items-center justify-between text-xs">
            {activeThread.window_active ? (
              <div className="flex items-center gap-1.5 text-emerald-400">
                <Clock className="w-3.5 h-3.5" />
                <span>
                  <strong>24h Customer Service Window is OPEN</strong> — Freeform text replies allowed.
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-amber-400">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>
                  <strong>24h Window Closed</strong> — Business-initiated outreach requires a WhatsApp Template.
                </span>
              </div>
            )}
          </div>

          {/* Messages Stream */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {loadingMessages ? (
              <div className="p-8 text-center text-xs text-zinc-500">Loading messages...</div>
            ) : messages.length === 0 ? (
              <div className="p-12 text-center text-xs text-zinc-500 space-y-2">
                <MessageSquare className="w-8 h-8 mx-auto text-zinc-600" />
                <p>No messages sent to this lead yet.</p>
                <p className="text-zinc-600">Send an initial outreach template below to start the conversation.</p>
              </div>
            ) : (
              messages.map((m) => {
                const isOutbound = m.direction === 'outbound';
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-md p-3.5 rounded-xl text-xs leading-relaxed ${
                        isOutbound
                          ? 'bg-emerald-900/40 border border-emerald-500/30 text-emerald-100 rounded-tr-sm'
                          : 'bg-zinc-800 border border-zinc-700/60 text-zinc-200 rounded-tl-sm'
                      }`}
                    >
                      {m.template_name && (
                        <div className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                          <FileText className="w-3 h-3" /> Template: {m.template_name}
                        </div>
                      )}
                      <p className="whitespace-pre-line">{m.content}</p>
                    </div>

                    <div className="flex items-center gap-1.5 mt-1 px-1 text-[10px] font-mono text-zinc-500">
                      <span>
                        {new Date(m.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {isOutbound && (
                        <span>
                          {m.status === 'read' ? (
                            <CheckCheck className="w-3 h-3 text-cyan-400" title="Read" />
                          ) : m.status === 'delivered' ? (
                            <CheckCheck className="w-3 h-3 text-zinc-400" title="Delivered" />
                          ) : m.status === 'sent' ? (
                            <Check className="w-3 h-3 text-zinc-500" title="Sent" />
                          ) : m.status === 'failed' ? (
                            <AlertCircle className="w-3 h-3 text-rose-400" title={m.error_details || 'Failed'} />
                          ) : null}
                        </span>
                      )}
                    </div>

                    {/* Delivery failure explanation banner */}
                    {isOutbound && m.status === 'failed' && (
                      <div className="max-w-md mt-1.5 p-2.5 rounded-lg bg-rose-950/40 border border-rose-500/30 text-[11px] text-rose-200 text-left space-y-1.5">
                        <div className="flex items-center gap-1.5 font-semibold text-rose-400">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>Meta Cloud API Delivery Error</span>
                        </div>
                        <p className="text-[10px] text-zinc-300 font-mono bg-zinc-950/70 p-1.5 rounded border border-zinc-800 break-words">
                          {m.error_details || 'Meta rejected this template.'}
                        </p>
                        {m.error_details?.includes('131058') ? (
                          <div className="text-[10px] text-amber-300/90 leading-relaxed bg-amber-950/30 p-2 rounded border border-amber-500/20 space-y-1">
                            <div>⚠️ <strong>Why this happens:</strong> Your number is now in <strong>LIVE</strong> mode. Meta strictly forbids sending <code>hello_world</code> from live numbers (it is only allowed for Meta's public sandbox test numbers).</div>
                            <div>👉 <strong>Fix:</strong> Create your own template (e.g. <code>initial_outreach</code> or <code>quick_intro</code>) in your <a href="https://business.facebook.com/wa/manage/templates" target="_blank" rel="noreferrer" className="underline text-emerald-400 font-medium">Meta WhatsApp Manager ↗</a>. Once approved (1–2 mins), send it here!</div>
                          </div>
                        ) : m.error_details?.includes('132001') ? (
                          <div className="text-[10px] text-amber-300/90 leading-relaxed bg-amber-950/30 p-2 rounded border border-amber-500/20">
                            ⚠️ <strong>Template Not Found:</strong> Meta has no approved template with this name. Please create it in your <a href="https://business.facebook.com/wa/manage/templates" target="_blank" rel="noreferrer" className="underline text-emerald-400 font-medium">Meta WhatsApp Manager ↗</a>.
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Composer */}
          <div className="p-3 border-t border-zinc-800 bg-zinc-950/80 space-y-2">
            {/* If 24h Window is inactive, show template sender */}
            {!activeThread.window_active ? (
              <div className="space-y-2 p-3 bg-zinc-900/60 border border-zinc-800 rounded-lg">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-zinc-300">Dispatch WhatsApp Outreach Template</span>
                  <a
                    href="https://business.facebook.com/wa/manage/templates"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-emerald-400 hover:text-emerald-300 underline font-mono"
                  >
                    Manage Templates on Meta ↗
                  </a>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-[11px] text-zinc-400">
                    <span>{customTemplateMode ? 'Enter custom Meta template name:' : 'Select pre-configured template:'}</span>
                    <button
                      type="button"
                      onClick={() => setCustomTemplateMode(!customTemplateMode)}
                      className="text-emerald-400 hover:text-emerald-300 text-[10px] underline"
                    >
                      {customTemplateMode ? '← Back to Presets' : '＋ Type custom template name'}
                    </button>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    {customTemplateMode ? (
                      <input
                        type="text"
                        value={customTemplateName}
                        onChange={(e) => setCustomTemplateName(e.target.value)}
                        placeholder="e.g. quick_intro, initial_outreach (exact name approved in Meta)"
                        className="bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 rounded px-3 py-2 flex-1 focus:outline-none focus:border-emerald-500/50"
                      />
                    ) : (
                      <select
                        value={selectedTemplate}
                        onChange={(e) => {
                          if (e.target.value === '__custom__') {
                            setCustomTemplateMode(true);
                          } else {
                            setSelectedTemplate(e.target.value);
                          }
                        }}
                        className="bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 rounded px-3 py-2 flex-1 focus:outline-none"
                      >
                        <option value="outreach_template_1">{'outreach_template_1 — "Custom Website for {{1}}"'}</option>
                        <option value="outreach_follow_up_1">{'outreach_follow_up_1 — "Just bumping this up..."'}</option>
                        <option value="initial_outreach">{'initial_outreach — "Hello {{1}}, we discovered your business..."'}</option>
                        <option value="partnership_offer">{'partnership_offer — "Hi {{1}}, quick partnership inquiry..."'}</option>
                        <option value="hello_world">hello_world — (Sandbox test numbers only)</option>
                        <option value="__custom__">＋ Type custom template name from Meta...</option>
                      </select>
                    )}

                    <button
                      onClick={handleSendTemplate}
                      disabled={sending}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 shrink-0"
                    >
                      <Send className="w-3.5 h-3.5" />
                      {sending ? 'Sending...' : 'Send Template'}
                    </button>
                  </div>

                  {selectedTemplate === 'outreach_template_1' && !customTemplateMode && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 pt-2 border-t border-zinc-800/60 text-xs">
                      <div>
                        <label className="text-[10px] text-zinc-400 block mb-0.5 font-medium">
                          Business Name (Header & Body)
                        </label>
                        <input
                          type="text"
                          value={templateBusinessName}
                          onChange={(e) => setTemplateBusinessName(e.target.value)}
                          placeholder="e.g. Istanbul Shawarma"
                          className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded px-2.5 py-1.5 focus:outline-none focus:border-emerald-500/50"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-zinc-400 block mb-0.5 font-medium">
                          Google Star Rating (Body)
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          min="1"
                          max="5"
                          value={templateRating}
                          onChange={(e) => setTemplateRating(e.target.value)}
                          placeholder="e.g. 4.8"
                          className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded px-2.5 py-1.5 focus:outline-none focus:border-emerald-500/50"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* If 24h Window is active, show freeform text composer */
              <form onSubmit={handleSendText} className="flex items-center gap-2">
                <input
                  type="text"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Type a freeform WhatsApp message (24h window active)..."
                  className="flex-1 px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
                  disabled={sending}
                />
                <button
                  type="submit"
                  disabled={!messageText.trim() || sending}
                  className="p-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-colors disabled:opacity-40"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-xs text-zinc-500">
          Select a conversation from the left pane to view messages.
        </div>
      )}
      {/* Meta Embedded Signup Modal */}
      <EmbeddedSignupModal
        isOpen={showEmbeddedModal}
        onClose={() => setShowEmbeddedModal(false)}
        onConnected={(data) => {
          setShowEmbeddedModal(false);
          fetchThreads();
        }}
      />
    </div>
  );
}
