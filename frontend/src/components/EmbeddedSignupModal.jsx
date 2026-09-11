import React, { useState, useEffect } from 'react';
import { whatsappApi } from '../api/client';
import { 
  Smartphone, 
  QrCode, 
  CheckCircle2, 
  ExternalLink, 
  AlertCircle, 
  RefreshCw, 
  Sparkles,
  ShieldCheck,
  X
} from 'lucide-react';

const APP_ID = '2258621364910411';
const CONFIG_ID = '1811181826536139';
const EMBEDDED_SIGNUP_URL =
  'https://business.facebook.com/messaging/whatsapp/onboard/?app_id=2258621364910411&config_id=1811181826536139&extras=%7B%22version%22%3A%22v4%22%2C%22sessionInfoVersion%22%3A%223%22%2C%22featureType%22%3A%22whatsapp_business_app_onboarding%22%7D';

export default function EmbeddedSignupModal({ isOpen, onClose, onConnected }) {
  const [sdkReady, setSdkReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [errorText, setErrorText] = useState('');
  const [capturedData, setCapturedData] = useState({
    waba_id: null,
    phone_number_id: null,
    code: null,
  });
  const [success, setSuccess] = useState(false);

  // Initialize Facebook JS SDK dynamically
  useEffect(() => {
    if (window.FB) {
      setSdkReady(true);
      return;
    }

    window.fbAsyncInit = function () {
      window.FB.init({
        appId: APP_ID,
        autoLogAppEvents: true,
        xfbml: true,
        version: 'v21.0',
      });
      setSdkReady(true);
    };

    // Load SDK script
    if (!document.getElementById('facebook-jssdk')) {
      const js = document.createElement('script');
      js.id = 'facebook-jssdk';
      js.src = 'https://connect.facebook.net/en_US/sdk.js';
      js.async = true;
      js.defer = true;
      js.crossOrigin = 'anonymous';
      document.body.appendChild(js);
    }
  }, []);

  // Listen for Meta postMessage events from Embedded Signup
  useEffect(() => {
    const handleMessage = async (event) => {
      // Check if message is from facebook.com
      if (!event.origin.includes('facebook.com') && !event.origin.includes('meta.com')) {
        return;
      }

      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data.type === 'WA_EMBEDDED_SIGNUP') {
          console.log('[Meta Embedded Signup] Received event:', data);
          const payload = data.data || {};
          const waba = payload.waba_id;
          const phoneId = payload.phone_number_id;

          setCapturedData((prev) => ({
            ...prev,
            waba_id: waba || prev.waba_id,
            phone_number_id: phoneId || prev.phone_number_id,
          }));

          setStatusText('Phone number & WABA paired with Meta Coexistence!');
        }
      } catch (e) {
        // Ignore unparseable postMessages
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleExchangeToken = async (code, phoneId, wabaId) => {
    setLoading(true);
    setStatusText('Exchanging OAuth authorization code with Meta Graph API...');
    try {
      const res = await whatsappApi.exchangeToken({
        code,
        phone_number_id: phoneId,
        waba_id: wabaId,
      });

      setSuccess(true);
      setStatusText('WhatsApp Business App & Cloud API connected in Coexistence Mode!');
      if (onConnected) onConnected(res.data);
    } catch (err) {
      console.error('Token exchange error:', err);
      setErrorText(
        err.response?.data?.detail ||
          'Token exchange failed. Please make sure your Meta App Secret is configured in Settings.'
      );
    } finally {
      setLoading(false);
    }
  };

  const launchWithFbSdk = () => {
    setErrorText('');
    setSuccess(false);

    if (!window.FB) {
      launchWithDirectPopup();
      return;
    }

    setLoading(true);
    setStatusText('Opening Meta Embedded Signup with Coexistence...');

    window.FB.login(
      function (response) {
        setLoading(false);
        if (response.authResponse && response.authResponse.code) {
          const authCode = response.authResponse.code;
          setCapturedData((prev) => ({ ...prev, code: authCode }));
          handleExchangeToken(authCode, capturedData.phone_number_id, capturedData.waba_id);
        } else {
          console.log('User cancelled or authorization incomplete:', response);
          setStatusText('Authorization closed or cancelled.');
        }
      },
      {
        config_id: CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          featureType: 'whatsapp_business_app_onboarding',
          sessionInfoVersion: '3',
          version: 'v4',
        },
      }
    );
  };

  const launchWithDirectPopup = () => {
    setErrorText('');
    setSuccess(false);
    setStatusText('Opening Meta Onboarding Window...');

    const width = 600;
    const height = 750;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    const popup = window.open(
      EMBEDDED_SIGNUP_URL,
      'MetaEmbeddedSignup',
      `width=${width},height=${height},top=${top},left=${left},scrollbars=yes`
    );

    if (!popup) {
      setErrorText('Popup blocked by browser. Please allow popups for this site and try again.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
                WhatsApp Coexistence Onboarding
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-mono">
                  Dual Mode
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Keep your WhatsApp Business mobile app and connect Cloud API simultaneously.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Coexistence Explanation Card */}
        <div className="p-4 rounded-xl bg-zinc-950/80 border border-zinc-800 space-y-2 text-xs text-zinc-300">
          <div className="flex items-center gap-2 font-medium text-emerald-400">
            <QrCode className="w-4 h-4" />
            <span>How Meta Coexistence Works</span>
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            1. The signup dialog will display a <strong>QR Code</strong> on your screen.<br />
            2. Open your <strong>WhatsApp Business mobile app</strong> on your phone &gt; Settings &gt; Linked Devices &gt; <strong>Link a Device</strong>.<br />
            3. Scan the QR code to pair your number without losing your chat history or mobile app access!
          </p>
        </div>

        {/* Live Status / Alerts */}
        {statusText && (
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{statusText}</span>
          </div>
        )}

        {errorText && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorText}</span>
          </div>
        )}

        {/* Captured Meta Identifiers Preview */}
        {(capturedData.phone_number_id || capturedData.waba_id) && (
          <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-[11px] space-y-1">
            <div className="text-zinc-500">Captured Meta Session Data:</div>
            {capturedData.phone_number_id && (
              <div className="text-zinc-300">Phone Number ID: {capturedData.phone_number_id}</div>
            )}
            {capturedData.waba_id && (
              <div className="text-zinc-300">WABA ID: {capturedData.waba_id}</div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2 pt-1">
          <button
            onClick={launchWithFbSdk}
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-950 disabled:opacity-50"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Connecting with Meta...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Launch Embedded Signup (Coexistence)
              </>
            )}
          </button>

          <button
            onClick={launchWithDirectPopup}
            type="button"
            className="w-full py-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors border border-zinc-700/60"
          >
            <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
            Direct Popup Fallback
          </button>
        </div>

        <div className="text-center">
          <span className="text-[10px] text-zinc-500 font-mono">
            Config ID: {CONFIG_ID} • App ID: {APP_ID} • Meta SDK v21.0
          </span>
        </div>
      </div>
    </div>
  );
}
