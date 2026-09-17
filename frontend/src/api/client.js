import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach JWT token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('om_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to catch 401s
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // If unauthorized, remove token
      localStorage.removeItem('om_token');
      localStorage.removeItem('om_user');
      if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  register: (name, email, password) => api.post('/auth/register', { name, email, password }),
  getMe: () => api.get('/auth/me'),
};

export const dashboardApi = {
  getStats: () => api.get('/dashboard/stats'),
};

export const leadsApi = {
  list: (params) => api.get('/leads', { params }),
  create: (data) => api.post('/leads', data),
  bulkImport: (leads) => api.post('/leads/bulk-import', leads),
  get: (id) => api.get(`/leads/${id}`),
  updateStatus: (id, status) => api.patch(`/leads/${id}/status`, { status }),
  delete: (id) => api.delete(`/leads/${id}`),
};

export const getMediaUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  const base = (api.defaults.baseURL || '').replace(/\/api\/?$/, '');
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
};

export const messagingApi = {
  getThreads: (params) => api.get('/messaging/threads', { params }),
  getThreadMessages: (leadId) => api.get(`/messaging/threads/${leadId}/messages`),
  sendText: (leadId, content) => api.post(`/messaging/threads/${leadId}/send-text`, { content }),
  sendAudio: (leadId, audioBlob, duration) => {
    const formData = new FormData();
    const ext = audioBlob.type.includes('mp4') ? 'm4a' : audioBlob.type.includes('ogg') ? 'ogg' : 'webm';
    formData.append('audio_file', audioBlob, `voice_note.${ext}`);
    if (duration) formData.append('duration', duration);
    return api.post(`/messaging/threads/${leadId}/send-audio`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  sendTemplate: (leadId, templateName, languageCode, parameters) =>
    api.post(`/messaging/threads/${leadId}/send-template`, {
      template_name: templateName,
      language_code: languageCode || 'en_US',
      parameters: parameters || [],
    }),
  syncThreads: () => api.post('/messaging/sync-threads'),
};

export const agentApi = {
  chat: (message) => api.post('/agent/chat', { message }),
  getHistory: () => api.get('/agent/history'),
};

export const simulatorApi = {
  simulateReply: (leadId, replyText) => api.post('/simulator/reply', { lead_id: leadId, reply_text: replyText }),
  simulateAudioReply: (leadId, duration = 4) =>
    api.post('/simulator/reply-audio', { lead_id: leadId, duration }),
  simulateRead: (leadId) => api.post(`/simulator/mark-read/${leadId}`),
};

export const whatsappApi = {
  exchangeToken: (data) => api.post('/whatsapp/exchange-token', data),
};

export const settingsApi = {
  get: () => api.get('/settings'),
  update: (data) => api.post('/settings', data),
};

export default api;
