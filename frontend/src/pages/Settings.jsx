import React, { useState, useEffect } from 'react';
import { settingsApi } from '../api/client';
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
  QrCode
} from 'lucide-react';

export default function Settings() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showEmbeddedModal, setShowEmbeddedModal] = useState(false);

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
  }, []);

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
