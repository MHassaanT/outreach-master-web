import React, { useState, useEffect, useRef } from 'react';
import { agentApi, leadsApi } from '../api/client';
import { 
  Sparkles, 
  Send, 
  Phone, 
  MapPin, 
  Star, 
  Globe, 
  Plus, 
  Check, 
  Download,
  AlertCircle,
  Bot,
  User as UserIcon
} from 'lucide-react';

export default function ResearchAgent({ setActiveTab, setSelectedLeadId }) {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'model',
      content: "Hello! I am your AI Lead Research Assistant. Tell me what prospective businesses you are looking for. I will query Google Places API, filter out businesses with websites, and strictly verify mobile phone numbers (excluding landlines).",
      leads: null
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [importedLeads, setImportedLeads] = useState({}); // place_id -> boolean
  const messagesEndRef = useRef(null);

  const suggestions = [
    "Find 10 restaurants in London without a website and with a mobile number",
    "Find 5 bakeries in Manchester with no website and non-landline phone",
    "Find 8 cafes without a website and mobile only",
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Load chat history if available
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const res = await agentApi.getHistory();
        if (res.data && res.data.length > 0) {
          setMessages([
            {
              id: 'welcome',
              role: 'model',
              content: "Welcome back! Here is your recent AI lead research conversation history. You can run new queries anytime.",
              leads: null
            },
            ...res.data
          ]);
        }
      } catch (err) {
        console.error('Failed to load history:', err);
      }
    };
    loadHistory();
  }, []);

  const handleSend = async (queryText) => {
    const textToSend = queryText || input;
    if (!textToSend.trim() || loading) return;

    const userMsg = {
      id: Date.now().toString(),
      role: 'user',
      content: textToSend,
      leads: null
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await agentApi.chat(textToSend);
      const botMsg = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: res.data.reply,
        leads: res.data.leads || [],
        stats: res.data.stats || {}
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      console.error('Agent chat error:', err);
      const errorMsg = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: "I encountered an error querying the Places API. Please check your API keys in Settings or try again.",
        leads: null
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleImportSingle = async (lead) => {
    try {
      await leadsApi.create({
        business_name: lead.business_name,
        phone_number: lead.phone_number,
        formatted_phone: lead.formatted_phone,
        phone_type: lead.phone_type,
        address: lead.address,
        rating: lead.rating,
        user_ratings_total: lead.user_ratings_total,
        website: lead.website,
        google_place_id: lead.google_place_id
      });
      setImportedLeads((prev) => ({ ...prev, [lead.google_place_id]: true }));
    } catch (err) {
      console.error('Failed to import lead:', err);
      // If already exists, still mark as imported
      setImportedLeads((prev) => ({ ...prev, [lead.google_place_id]: true }));
    }
  };

  const handleImportAll = async (leadsList) => {
    if (!leadsList || leadsList.length === 0) return;
    try {
      const payload = leadsList.map((lead) => ({
        business_name: lead.business_name,
        phone_number: lead.phone_number,
        formatted_phone: lead.formatted_phone,
        phone_type: lead.phone_type,
        address: lead.address,
        rating: lead.rating,
        user_ratings_total: lead.user_ratings_total,
        website: lead.website,
        google_place_id: lead.google_place_id
      }));
      await leadsApi.bulkImport(payload);
      const newImported = { ...importedLeads };
      leadsList.forEach((l) => {
        newImported[l.google_place_id] = true;
      });
      setImportedLeads(newImported);
    } catch (err) {
      console.error('Bulk import error:', err);
    }
  };

  return (
    <div className="max-w-5xl mx-auto flex flex-col h-[calc(100vh-6.5rem)] py-2">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
              Gemini Places Lead Agent
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                Places API + Mobile Filter
              </span>
            </h1>
            <p className="text-xs text-zinc-400">
              Natural language lead prospecting with automated landline exclusion.
            </p>
          </div>
        </div>
      </div>

      {/* Chat Messages Stream */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-2 pb-4">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div key={msg.id} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
              {!isUser && (
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0 mt-1">
                  <Bot className="w-3.5 h-3.5" />
                </div>
              )}

              <div className={`max-w-3xl space-y-3 ${isUser ? 'items-end' : 'items-start'}`}>
                <div
                  className={`p-4 rounded-xl text-xs leading-relaxed ${
                    isUser
                      ? 'bg-zinc-800 text-zinc-100 rounded-tr-sm border border-zinc-700/60'
                      : 'bg-zinc-900/70 text-zinc-200 rounded-tl-sm border border-zinc-800'
                  }`}
                >
                  <p className="whitespace-pre-line">{msg.content}</p>
                </div>

                {/* Discovered Leads Deck */}
                {msg.leads && msg.leads.length > 0 && (
                  <div className="space-y-3 pt-1">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-xs font-medium text-zinc-400">
                        Discovered {msg.leads.length} Qualified Leads
                      </span>
                      <button
                        onClick={() => handleImportAll(msg.leads)}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shadow-sm"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Import All to Pipeline
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {msg.leads.map((lead, idx) => {
                        const isImported = importedLeads[lead.google_place_id];
                        return (
                          <div
                            key={lead.google_place_id || idx}
                            className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 transition-all flex flex-col justify-between gap-3"
                          >
                            <div className="space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <h3 className="text-sm font-semibold text-zinc-100 line-clamp-1">
                                  {lead.business_name}
                                </h3>
                                {lead.rating && (
                                  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 text-[11px] font-mono shrink-0">
                                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                    {lead.rating} ({lead.user_ratings_total || 0})
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                                <MapPin className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                                <span className="truncate">{lead.address || 'Address not listed'}</span>
                              </div>

                              <div className="flex items-center gap-1.5 text-xs font-mono text-emerald-400 font-medium">
                                <Phone className="w-3.5 h-3.5 shrink-0" />
                                <span>{lead.formatted_phone || lead.phone_number}</span>
                              </div>

                              {/* Badges */}
                              <div className="flex flex-wrap gap-1.5 pt-1">
                                <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-medium">
                                  ✓ No Website
                                </span>
                                <span className="px-2 py-0.5 rounded text-[10px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-medium">
                                  ✓ Mobile Verified
                                </span>
                              </div>
                            </div>

                            {/* Action */}
                            <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between">
                              <span className="text-[11px] text-zinc-500 capitalize">
                                {lead.types?.[0]?.replace(/_/g, ' ') || 'Food Point'}
                              </span>
                              <button
                                onClick={() => handleImportSingle(lead)}
                                disabled={isImported}
                                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                                  isImported
                                    ? 'bg-zinc-800 text-zinc-400 cursor-default'
                                    : 'bg-zinc-100 hover:bg-white text-zinc-900'
                                }`}
                              >
                                {isImported ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-400" />
                                    In Pipeline
                                  </>
                                ) : (
                                  <>
                                    <Plus className="w-3 h-3" />
                                    Add to Pipeline
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {isUser && (
                <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700/60 flex items-center justify-center text-zinc-300 shrink-0 mt-1">
                  <UserIcon className="w-3.5 h-3.5" />
                </div>
              )}
            </div>
          );
        })}

        {loading && (
          <div className="flex gap-3 items-start">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <Bot className="w-3.5 h-3.5" />
            </div>
            <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs text-zinc-400 flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
              <span>Querying Google Places & analyzing phone numbers (filtering landlines)...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggestions Chips */}
      <div className="py-2 flex items-center gap-2 overflow-x-auto text-xs">
        <span className="text-[11px] text-zinc-500 shrink-0">Try asking:</span>
        {suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => handleSend(s)}
            className="px-2.5 py-1 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 whitespace-nowrap text-xs transition-colors shrink-0"
          >
            "{s.slice(0, 38)}..."
          </button>
        ))}
      </div>

      {/* Input Box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="pt-2"
      >
        <div className="relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. Find me 10 food points in York that does not have a website and do have a phone number not landline"
            className="w-full pl-4 pr-12 py-3 rounded-xl bg-zinc-900/90 border border-zinc-800 focus:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 text-xs text-zinc-100 placeholder-zinc-500 transition-all"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="absolute right-2 p-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>
    </div>
  );
}
