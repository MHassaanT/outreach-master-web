import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pino from 'pino';
import QRCode from 'qrcode';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authFolder = path.join(__dirname, 'auth_info_baileys');
const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.use(express.json());

// Global state
let sock = null;
let connectionStatus = 'disconnected'; // 'disconnected' | 'connecting' | 'connected'
let qrCodeData = null; // Base64 data URL of current pairing QR code
let connectedUser = null; // { id, name, phone }
let isInitializing = false;

/**
 * Initializes the Baileys multi-device socket connection
 */
async function initWhatsApp(forceNew = false) {
  if (connectionStatus === 'connected' && sock && !forceNew) {
    return { status: connectionStatus, connected: true, qr: null, user: connectedUser };
  }

  if (isInitializing) {
    return { status: connectionStatus, connected: connectionStatus === 'connected', qr: qrCodeData, user: connectedUser };
  }

  isInitializing = true;
  connectionStatus = 'connecting';

  try {
    if (!fs.existsSync(authFolder)) {
      fs.mkdirSync(authFolder, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(authFolder);
    
    let version = [2, 3000, 1015901307];
    try {
      const latest = await fetchLatestBaileysVersion();
      if (latest && latest.version) {
        version = latest.version;
      }
    } catch (ve) {
      console.warn('[Baileys] Using fallback protocol version:', ve.message);
    }

    sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      browser: ['Outreach Master', 'Chrome', '1.0.0'],
      syncFullHistory: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        connectionStatus = 'connecting';
        try {
          qrCodeData = await QRCode.toDataURL(qr, { margin: 2, scale: 6 });
          console.log('[Baileys] Generated new pairing QR Code data URL');
        } catch (qrErr) {
          console.error('[Baileys] QR code render error:', qrErr);
        }
      }

      if (connection === 'open') {
        connectionStatus = 'connected';
        qrCodeData = null;
        const rawJid = sock.user?.id || '';
        const phoneDigits = rawJid.split(':')[0].split('@')[0];
        connectedUser = {
          id: rawJid,
          name: sock.user?.name || `+${phoneDigits}`,
          phone: `+${phoneDigits}`
        };
        console.log(`[Baileys] WhatsApp connected successfully as: ${connectedUser.phone} (${connectedUser.name})`);
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        console.log(`[Baileys] Connection closed (code: ${statusCode}, isLoggedOut: ${isLoggedOut})`);

        qrCodeData = null;
        if (isLoggedOut) {
          connectionStatus = 'disconnected';
          connectedUser = null;
          try {
            fs.rmSync(authFolder, { recursive: true, force: true });
          } catch (e) {}
        } else {
          // Reconnect automatically if not explicitly logged out
          connectionStatus = 'connecting';
          setTimeout(() => {
            initWhatsApp();
          }, 3000);
        }
      }
    });

  } catch (err) {
    console.error('[Baileys] Initialization error:', err);
    connectionStatus = 'disconnected';
    qrCodeData = null;
  } finally {
    isInitializing = false;
  }

  return { status: connectionStatus, connected: connectionStatus === 'connected', qr: qrCodeData, user: connectedUser };
}

// REST Endpoints

/**
 * GET /api/status - Get current connection state and active QR code
 */
app.get('/api/status', (req, res) => {
  res.json({
    status: connectionStatus,
    connected: connectionStatus === 'connected',
    qr: qrCodeData,
    user: connectedUser
  });
});

/**
 * POST /api/connect - Request WhatsApp socket initialization & QR generation
 */
app.post('/api/connect', async (req, res) => {
  try {
    const result = await initWhatsApp();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/logout - Disconnect socket and clear authentication folder
 */
app.post('/api/logout', async (req, res) => {
  try {
    if (sock) {
      try {
        await sock.logout();
      } catch (e) {}
      try {
        sock.end();
      } catch (e) {}
      sock = null;
    }
    connectionStatus = 'disconnected';
    connectedUser = null;
    qrCodeData = null;
    try {
      fs.rmSync(authFolder, { recursive: true, force: true });
    } catch (e) {}
    console.log('[Baileys] Disconnected and cleared auth session credentials.');
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/verify-single - Test a single phone number against onWhatsApp()
 */
app.post('/api/verify-single', async (req, res) => {
  const { number } = req.body;
  if (!number) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  if (connectionStatus !== 'connected' || !sock) {
    return res.status(400).json({
      error: 'WhatsApp is not connected. Please scan QR Code in Settings first.'
    });
  }

  try {
    const cleanDigits = String(number).replace(/\D/g, '');
    if (!cleanDigits) {
      return res.json({ number, exists: false, jid: null });
    }

    const results = await sock.onWhatsApp(cleanDigits);
    const match = Array.isArray(results) ? results.find(r => r && r.exists) : null;

    res.json({
      number,
      cleanDigits,
      exists: Boolean(match && match.exists),
      jid: match ? match.jid : null
    });
  } catch (err) {
    console.error('[Baileys] onWhatsApp single verify error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/verify-numbers - Verify a batch of phone numbers against onWhatsApp()
 */
app.post('/api/verify-numbers', async (req, res) => {
  const { numbers } = req.body;
  if (!Array.isArray(numbers) || numbers.length === 0) {
    return res.json({ results: {} });
  }

  if (connectionStatus !== 'connected' || !sock) {
    return res.status(400).json({
      error: 'WhatsApp is not connected. Please scan QR Code in Settings first.'
    });
  }

  try {
    const BATCH_SIZE = 50;
    const verifiedMap = {}; // phone -> boolean

    for (let i = 0; i < numbers.length; i += BATCH_SIZE) {
      const batch = numbers.slice(i, i + BATCH_SIZE);
      const queryList = batch
        .map(num => String(num).replace(/\D/g, ''))
        .filter(digits => digits.length >= 7);

      const activeDigits = new Set();
      if (queryList.length > 0) {
        try {
          const checkResults = await sock.onWhatsApp(...queryList);
          if (Array.isArray(checkResults)) {
            for (const item of checkResults) {
              if (item && item.exists) {
                const d = (item.jid || '').split('@')[0].split(':')[0];
                activeDigits.add(d);
              }
            }
          }
        } catch (batchErr) {
          console.error('[Baileys] onWhatsApp batch check error:', batchErr.message);
        }
      }

      for (const num of batch) {
        const digits = String(num).replace(/\D/g, '');
        verifiedMap[num] = activeDigits.has(digits);
      }
    }

    res.json({ results: verifiedMap });
  } catch (err) {
    console.error('[Baileys] Batch verify error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Auto-connect if existing credentials exist in auth folder
const credsFile = path.join(authFolder, 'creds.json');
if (fs.existsSync(credsFile)) {
  console.log('[Baileys] Found existing session credentials. Auto-connecting...');
  initWhatsApp();
}

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[Baileys] WhatsApp service running on http://127.0.0.1:${PORT}`);
});
