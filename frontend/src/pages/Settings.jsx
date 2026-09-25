import React, { useState, useEffect } from 'react';
import { settingsApi, baileysApi } from '../api/client';
import EmbeddedSignupModal from '../components/EmbeddedSignupModal';
import { 
  Key, 
  ShieldCheck, 
  MessageSquare, 
  MapPin, 
  Sparkles, 
  Check, 
  Copy,
  Info,
  Smartphone,
  QrCode,
  Wifi,
  WifiOff,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle
} from 'lucide-react';

export default function Settings() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showEmbeddedModal, setShowEmbeddedModal] = useState(false);

  // Baileys WhatsApp Web State
  const [baileys, setBaileys] = useState({ connected: false, status: 'disconnected', qr: null, user: null });
  const [baileysLoading, setBaileysLoading] = useState(false);
  const [testNumber, setTestNumber] = useState('');
  const [testingNumber, setTestingNumber] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const [form, setForm] = useState({
    gemini_api_key: '',
    google_maps_api_key: '',
    whatsapp_app_id: '',
    whatsapp_config_id: '',
    whatsapp_app_secret: '',
    whatsapp_phone_number_id: '',
    whatsapp_business_account_id: '',
    whatsapp_access_token: '',
    whatsapp_verify_token: '',
    whatsapp_mock_mode: true,
    firebase_server_key: '',
    firebase_service_account_base64: '',
  });

  const fetchBaileysStatus = async () => {
    try {
      const res = await baileysApi.getStatus();
      setBaileys(res.data);
    } catch (e) {
      console.warn('Failed to fetch Baileys status:', e);
    }
  };

  const handleBaileysConnect = async () => {
    setBaileysLoading(true);
    try {
      const res = await baileysApi.connect();
      setBaileys(res.data);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to start Baileys connection. Make sure the Baileys service is running on port 3001.');
    } finally {
      setBaileysLoading(false);
    }
  };

  const handleBaileysDisconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect this WhatsApp session? You will need to scan the QR code again to reconnect.')) {
      return;
    }
    setBaileysLoading(true);
    try {
      await baileysApi.disconnect();
      setBaileys({ connected: false, status: 'disconnected', qr: null, user: null });
    } catch (err) {
      alert('Failed to disconnect');
    } finally {
      setBaileysLoading(false);
    }
  };

  const handleTestVerify = async (e) => {
    e.preventDefault();
    if (!testNumber.trim()) return;
    setTestingNumber(true);
    setTestResult(null);
    try {
      const res = await baileysApi.verifySingle(testNumber.trim());
      setTestResult(res.data);
    } catch (err) {
      setTestResult({ error: err.response?.data?.detail || err.message, exists: false });
    } finally {
      setTestingNumber(false);
    }
  };

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await settingsApi.get();
      setConfig(res.data);
      setForm((prev) => ({
        ...prev,
        whatsapp_app_id: res.data.whatsapp_app_id || '',
        whatsapp_config_id: res.data.whatsapp_config_id || '',
        whatsapp_phone_number_id: res.data.whatsapp_phone_number_id || '',
        whatsapp_business_account_id: res.data.whatsapp_business_account_id || '',
        whatsapp_verify_token: res.data.whatsapp_verify_token || '',
        whatsapp_mock_mode: res.data.whatsapp_mock_mode ?? true,
        firebase_server_key: res.data.firebase_server_key || '',
        firebase_service_account_base64: '',
      }));
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchBaileysStatus();
  }, []);

  // Poll Baileys status while waiting for user to scan QR code
  useEffect(() => {
    if (baileys.status === 'connecting') {
      const interval = setInterval(() => {
        fetchBaileysStatus();
      }, 2500);
      return () => clearInterval(interval);
    }
  }, [baileys.status]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSavedSuccess(false);
    try {
      await settingsApi.update(form);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
      fetchSettings();
    } catch (err) {
      alert('Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const copyWebhookUrl = () => {
    const url = `${window.location.origin}/api/whatsapp/webhook`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-4 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Engine Settings & Integrations</h1>
        <p className="text-xs text-zinc-400 mt-1">
          Manage your Gemini AI model, Google Maps Places API key, and Meta WhatsApp Business credentials.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Gemini AI & Google Places */}
        <div className="p-5 rounded-xl border border-zinc-800/80 bg-zinc-900/30 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-zinc-200">AI & Places API Keys</h2>
            </div>
            {config?.gemini_api_key_configured && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                Gemini Active
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Gemini API Key
              </label>
              <input
                type="password"
                value={form.gemini_api_key}
                onChange={(e) => setForm({ ...form, gemini_api_key: e.target.value })}
                placeholder={config?.gemini_masked || "AIzaSy..."}
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
              />
              <p className="text-[10px] text-zinc-500 mt-1">Used for natural language parsing & lead filtering.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Google Maps Places API Key
              </label>
              <input
                type="password"
                value={form.google_maps_api_key}
                onChange={(e) => setForm({ ...form, google_maps_api_key: e.target.value })}
                placeholder={config?.google_maps_masked || "AIzaSy..."}
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
              />
              <p className="text-[10px] text-zinc-500 mt-1">Enables live Places search (falls back to demo data if empty).</p>
            </div>
          </div>
        </div>

        {/* Baileys WhatsApp Web QR Connection */}
        <div className="p-5 rounded-xl border border-zinc-800/80 bg-zinc-900/30 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <QrCode className="w-4 h-4 text-emerald-400" />
              <div>
                <h2 className="text-sm font-semibold text-zinc-200">WhatsApp Web Connection (via Baileys)</h2>
                <p className="text-[11px] text-zinc-400">
                  Connect any WhatsApp phone via QR Code to verify candidate numbers during spreadsheet lead import.
                </p>
              </div>
            </div>
            {baileys.connected ? (
              <span className="inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Connected ({baileys.user?.phone || 'WhatsApp'})
              </span>
            ) : baileys.status === 'connecting' ? (
              <span className="inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                Waiting for QR Scan
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700 font-medium shrink-0">
                <WifiOff className="w-3 h-3" />
                Disconnected
              </span>
            )}
          </div>

          {/* Connection Actions & QR Display */}
          {baileys.connected ? (
            <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Active Multi-Device WhatsApp Link
                </div>
                <div className="text-[11px] text-zinc-300">
                  Linked device: <strong className="text-white font-mono">{baileys.user?.phone}</strong>
                  {baileys.user?.name && <span className="text-zinc-400 ml-1">({baileys.user?.name})</span>}
                </div>
                <p className="text-[10px] text-zinc-400">
                  Spreadsheet imports will check each lead with native <code className="text-emerald-400 bg-zinc-950 px-1 py-0.5 rounded">onWhatsApp()</code> and filter out non-WhatsApp numbers.
                </p>
              </div>
              <button
                type="button"
                onClick={handleBaileysDisconnect}
                disabled={baileysLoading}
                className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-rose-950/60 hover:text-rose-400 text-zinc-300 text-xs font-medium border border-zinc-700/80 transition-all shrink-0"
              >
                Disconnect / Logout
              </button>
            </div>
          ) : baileys.status === 'connecting' && baileys.qr ? (
            <div className="p-5 rounded-xl bg-zinc-950 border border-zinc-800 flex flex-col items-center justify-center text-center space-y-4">
              <div className="space-y-1">
                <h3 className="text-xs font-semibold text-zinc-200">Scan QR Code with WhatsApp</h3>
                <p className="text-[11px] text-zinc-400 max-w-sm">
                  1. Open WhatsApp on your phone<br />
                  2. Tap <strong>Linked Devices</strong> &gt; <strong>Link a Device</strong><br />
                  3. Point your camera at this QR code
                </p>
              </div>

              <div className="p-3 bg-white rounded-xl shadow-lg border border-zinc-700 inline-block">
                <img 
                  src={baileys.qr} 
                  alt="WhatsApp Pairing QR Code" 
                  className="w-52 h-52 object-contain"
                />
              </div>

              <div className="flex items-center gap-2 text-[11px] text-amber-400">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Listening for scan (auto-refreshes)...
              </div>

              <button
                type="button"
                onClick={handleBaileysDisconnect}
                className="text-xs text-zinc-400 hover:text-zinc-200 underline"
              >
                Cancel Pairing
              </button>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-xs font-medium text-zinc-200">Link WhatsApp to enable onWhatsApp() Lead Verification</div>
                <p className="text-[11px] text-zinc-400 max-w-lg">
                  Generates a pairing QR code powered by Baileys. Allows Outreach Master to automatically test and remove invalid or landline numbers that cannot receive WhatsApp messages.
                </p>
              </div>
              <button
                type="button"
                onClick={handleBaileysConnect}
                disabled={baileysLoading}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-all shrink-0 shadow-sm"
              >
                {baileysLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Initializing...
                  </>
                ) : (
                  <>
                    <QrCode className="w-4 h-4" />
                    Connect WhatsApp (QR Code)
                  </>
                )}
              </button>
            </div>
          )}

          {/* Test onWhatsApp Single Number Tool */}
          <div className="pt-2 border-t border-zinc-800/80">
            <div className="text-xs font-medium text-zinc-300 mb-2 flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-emerald-400" />
              Test onWhatsApp() Verification Tool
            </div>
            <form onSubmit={handleTestVerify} className="flex flex-col sm:flex-row gap-2 items-center">
              <input
                type="text"
                value={testNumber}
                onChange={(e) => setTestNumber(e.target.value)}
                placeholder="Enter phone number to test (e.g. +44 7712 345678)"
                className="flex-1 w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700 font-mono"
              />
              <button
                type="submit"
                disabled={testingNumber || !testNumber.trim() || !baileys.connected}
                className="w-full sm:w-auto px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-xs font-medium text-zinc-200 transition-colors flex items-center justify-center gap-1.5 shrink-0"
              >
                {testingNumber ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
                Verify Number
              </button>
            </form>
            {!baileys.connected && (
              <p className="text-[10px] text-amber-500/80 mt-1">Connect WhatsApp above first to run real-time number verification tests.</p>
            )}

            {testResult && (
              <div className="mt-2.5 p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs flex items-center justify-between">
                <span className="font-mono text-zinc-300">{testResult.number}</span>
                {testResult.exists ? (
                  <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Registered on WhatsApp {testResult.jid ? `(${testResult.jid})` : ''}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-rose-400 font-medium">
                    <XCircle className="w-3.5 h-3.5" />
                    Not on WhatsApp {testResult.error ? `(${testResult.error})` : ''}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* WhatsApp Business Cloud API */}
        <div className="p-5 rounded-xl border border-zinc-800/80 bg-zinc-900/30 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-zinc-200">WhatsApp Business Cloud API</h2>
            </div>
            {config?.whatsapp_configured ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                Meta Connected
              </span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                Simulator Mode Active
              </span>
            )}
          </div>

          {/* Meta Embedded Signup (Coexistence) Callout */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/40 to-zinc-950 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-semibold text-zinc-100">Meta Embedded Signup (Mobile App Coexistence)</span>
              </div>
              <p className="text-[11px] text-zinc-400 max-w-lg leading-relaxed">
                Connect your WhatsApp Business number via Meta's pairing QR code. Keep using the WhatsApp Business mobile app and Cloud API simultaneously!
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowEmbeddedModal(true)}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-all shrink-0 shadow-sm shadow-emerald-950"
            >
              <QrCode className="w-4 h-4" />
              Pair with Embedded Signup
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Meta App ID
              </label>
              <input
                type="text"
                value={form.whatsapp_app_id}
                onChange={(e) => setForm({ ...form, whatsapp_app_id: e.target.value })}
                placeholder="2258621364910411"
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Meta Config ID (Embedded Signup)
              </label>
              <input
                type="text"
                value={form.whatsapp_config_id}
                onChange={(e) => setForm({ ...form, whatsapp_config_id: e.target.value })}
                placeholder="1811181826536139"
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Meta App Secret (Enables Auto Token Exchange)
              </label>
              <input
                type="password"
                value={form.whatsapp_app_secret}
                onChange={(e) => setForm({ ...form, whatsapp_app_secret: e.target.value })}
                placeholder={config?.whatsapp_secret_masked || "Found in Meta Dashboard > App Settings > Basic"}
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
              />
              <p className="text-[10px] text-zinc-500 mt-1">
                Used to exchange the Embedded Signup OAuth authorization code for permanent tokens automatically.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                WhatsApp Phone Number ID
              </label>
              <input
                type="text"
                value={form.whatsapp_phone_number_id}
                onChange={(e) => setForm({ ...form, whatsapp_phone_number_id: e.target.value })}
                placeholder="Auto-populated by Embedded Signup"
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                WhatsApp Business Account ID (WABA)
              </label>
              <input
                type="text"
                value={form.whatsapp_business_account_id}
                onChange={(e) => setForm({ ...form, whatsapp_business_account_id: e.target.value })}
                placeholder="Auto-populated by Embedded Signup"
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Permanent Access Token (Auto-generated by Embedded Signup)
              </label>
              <input
                type="password"
                value={form.whatsapp_access_token}
                onChange={(e) => setForm({ ...form, whatsapp_access_token: e.target.value })}
                placeholder={config?.whatsapp_token_masked || "EAAG... (auto-filled on embedded signup)"}
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Webhook Verify Token
              </label>
              <input
                type="text"
                value={form.whatsapp_verify_token}
                onChange={(e) => setForm({ ...form, whatsapp_verify_token: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-950 border border-zinc-800">
              <div>
                <span className="text-xs font-medium text-zinc-300">WhatsApp Offline Simulator Mode</span>
                <p className="text-[10px] text-zinc-500">Allows offline message testing without live Meta calls.</p>
              </div>
              <input
                type="checkbox"
                checked={form.whatsapp_mock_mode}
                onChange={(e) => setForm({ ...form, whatsapp_mock_mode: e.target.checked })}
                className="w-4 h-4 rounded border-zinc-700 text-emerald-500 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Firebase Cloud Messaging (Mobile Push Alerts) */}
          <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-zinc-100">
                <Smartphone className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-semibold uppercase tracking-wider">Google Firebase Push (FCM v1)</h3>
              </div>
              {config?.firebase_configured && (
                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-950 text-emerald-400 border border-emerald-800/80">
                  {config?.firebase_service_account_configured ? 'Service Account Active' : 'Server Key Configured'}
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400">
              Powers instant Android push notifications even when the Outreach Master Mobile app is completely closed or swiped away.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Firebase Server Key (Legacy FCM)
                </label>
                <input
                  type="password"
                  value={form.firebase_server_key}
                  onChange={(e) => setForm({ ...form, firebase_server_key: e.target.value })}
                  placeholder={config?.firebase_server_key_configured ? '•••••••••••••••• (Configured)' : 'AAAA...'}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Firebase Service Account Base64 (HTTP v1)
                </label>
                <input
                  type="password"
                  value={form.firebase_service_account_base64}
                  onChange={(e) => setForm({ ...form, firebase_service_account_base64: e.target.value })}
                  placeholder={config?.firebase_service_account_configured ? '•••••••••••••••• (Active in Railway/Env)' : 'Paste base64 string...'}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Webhook Callback Info */}
          <div className="p-3.5 rounded-lg bg-zinc-950 border border-zinc-800/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-300">Meta Webhook Configuration Callback URL</span>
              <button
                type="button"
                onClick={copyWebhookUrl}
                className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied' : 'Copy URL'}
              </button>
            </div>
            <code className="block p-2 rounded bg-zinc-900 text-xs font-mono text-zinc-400 truncate">
              {window.location.origin}/api/whatsapp/webhook
            </code>
            <p className="text-[10px] text-zinc-500">
              In your Meta App Dashboard under WhatsApp &gt; Configuration, subscribe to <code>messages</code> with this callback URL and your Verify Token.
            </p>
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-between pt-2">
          {savedSuccess ? (
            <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
              <Check className="w-3.5 h-3.5" /> Settings saved to .env successfully!
            </span>
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium shadow-sm transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </form>

      {/* Meta Embedded Signup Modal */}
      <EmbeddedSignupModal
        isOpen={showEmbeddedModal}
        onClose={() => setShowEmbeddedModal(false)}
        onConnected={(data) => {
          setShowEmbeddedModal(false);
          fetchSettings();
        }}
      />
    </div>
  );
}
