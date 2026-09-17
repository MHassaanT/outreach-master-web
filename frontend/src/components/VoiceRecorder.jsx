import React, { useState, useRef, useEffect } from 'react';
import { Mic, Trash2, Send, Square } from 'lucide-react';

export default function VoiceRecorder({ onSendAudio, disabled = false }) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      stopTracks();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const stopTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const startRecording = async () => {
    if (disabled || isRecording) return;

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Microphone recording is not supported in this browser environment.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Determine best supported MIME type
      let mimeType = '';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
        mimeType = 'audio/ogg;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      }

      const options = mimeType ? { mimeType } : {};
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(200); // 200ms timeslices
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Failed to start recording:', err);
      alert('Microphone access was denied or is unavailable. Please grant microphone permissions in your browser.');
      stopTracks();
      setIsRecording(false);
    }
  };

  const cancelRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    stopTracks();
    audioChunksRef.current = [];
    setIsRecording(false);
    setRecordingTime(0);
  };

  const stopAndSend = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;

    if (timerRef.current) clearInterval(timerRef.current);
    const duration = Math.max(1, recordingTime);

    mediaRecorderRef.current.onstop = () => {
      const mimeType = mediaRecorderRef.current.mimeType || 'audio/webm';
      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
      stopTracks();
      setIsRecording(false);
      setRecordingTime(0);

      if (audioBlob.size > 0 && onSendAudio) {
        onSendAudio(audioBlob, duration);
      }
    };

    mediaRecorderRef.current.stop();
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (isRecording) {
    return (
      <div className="flex items-center gap-2 flex-1 px-3 py-1.5 rounded-xl bg-rose-950/40 border border-rose-500/40 animate-pulse-subtle">
        {/* Blinking red dot */}
        <div className="flex items-center gap-1.5 text-rose-400 font-mono text-xs">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
          <span className="font-semibold">{formatTime(recordingTime)}</span>
        </div>

        {/* Dynamic audio waves indicator */}
        <div className="flex-1 flex items-center justify-center gap-1 px-2 h-4">
          <span className="w-1 h-3 bg-rose-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1 h-5 bg-rose-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1 h-2 bg-rose-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          <span className="w-1 h-4 bg-rose-500 rounded-full animate-bounce" style={{ animationDelay: '200ms' }} />
          <span className="w-1 h-6 bg-rose-400 rounded-full animate-bounce" style={{ animationDelay: '100ms' }} />
          <span className="w-1 h-3 bg-rose-500 rounded-full animate-bounce" style={{ animationDelay: '250ms' }} />
        </div>

        {/* Discard Button */}
        <button
          type="button"
          onClick={cancelRecording}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-900/30 transition-colors"
          title="Discard recording"
        >
          <Trash2 className="w-4 h-4" />
        </button>

        {/* Send Voice Note Button */}
        <button
          type="button"
          onClick={stopAndSend}
          className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors shadow-sm"
          title="Send voice note"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startRecording}
      disabled={disabled}
      className="p-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-emerald-400 border border-zinc-700/60 transition-colors disabled:opacity-40"
      title="Record voice note"
    >
      <Mic className="w-4 h-4" />
    </button>
  );
}
