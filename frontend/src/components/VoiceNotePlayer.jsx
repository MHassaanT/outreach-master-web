import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Mic } from 'lucide-react';
import { getMediaUrl } from '../api/client';

export default function VoiceNotePlayer({ audioUrl, duration: initialDuration, isOutbound = false }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration || 0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isLoaded, setIsLoaded] = useState(false);
  const audioRef = useRef(null);

  const fullUrl = getMediaUrl(audioUrl);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(Math.round(audio.duration));
      }
      setIsLoaded(true);
    };

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
    };
  }, [fullUrl]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => {
        setIsPlaying(true);
      }).catch((err) => {
        console.error('Audio play error:', err);
        setIsPlaying(false);
      });
    }
  };

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const progress = Math.max(0, Math.min(1, clickX / width));
    const audio = audioRef.current;
    if (audio && duration > 0) {
      const newTime = progress * duration;
      audio.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const cyclePlaybackRate = () => {
    const rates = [1, 1.5, 2];
    const nextRate = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const formatTime = (secs) => {
    const s = Math.floor(secs || 0);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem < 10 ? '0' : ''}${rem}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Waveform bar heights mimicking WhatsApp voice message waves
  const waveBars = [
    40, 70, 50, 90, 60, 100, 75, 45, 80, 60, 
    95, 70, 50, 85, 100, 60, 40, 75, 90, 55, 
    70, 40, 60, 85, 50, 65, 90, 45, 70, 35
  ];

  return (
    <div className="flex items-center gap-3 py-1 px-1 min-w-[240px] max-w-xs select-none">
      <audio ref={audioRef} src={fullUrl} preload="metadata" />

      {/* Play/Pause Button */}
      <button
        type="button"
        onClick={togglePlay}
        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 shadow-sm ${
          isOutbound
            ? 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950'
            : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-100'
        }`}
        title={isPlaying ? 'Pause' : 'Play voice note'}
      >
        {isPlaying ? (
          <Pause className="w-4 h-4 fill-current" />
        ) : (
          <Play className="w-4 h-4 fill-current ml-0.5" />
        )}
      </button>

      {/* Waveform Scrubber & Timer */}
      <div className="flex-1 flex flex-col justify-center gap-1.5 min-w-0">
        {/* Scrubber track */}
        <div
          onClick={handleSeek}
          className="relative h-7 flex items-center gap-0.5 cursor-pointer group"
          title="Click to seek"
        >
          {waveBars.map((heightPercent, idx) => {
            const barProgress = (idx / waveBars.length) * 100;
            const isPlayed = barProgress <= progressPercent;
            return (
              <div
                key={idx}
                className={`flex-1 rounded-full transition-colors ${
                  isPlayed
                    ? isOutbound
                      ? 'bg-emerald-400'
                      : 'bg-emerald-400'
                    : isOutbound
                    ? 'bg-emerald-900/80 group-hover:bg-emerald-800/80'
                    : 'bg-zinc-600 group-hover:bg-zinc-500'
                }`}
                style={{ height: `${Math.max(20, heightPercent)}%` }}
              />
            );
          })}
        </div>

        {/* Duration & Speed Controls */}
        <div className="flex items-center justify-between text-[10px] font-mono leading-none">
          <span className={isOutbound ? 'text-emerald-300' : 'text-zinc-400'}>
            {isPlaying || currentTime > 0
              ? `${formatTime(currentTime)} / ${formatTime(duration)}`
              : formatTime(duration)}
          </span>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={cyclePlaybackRate}
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-colors ${
                isOutbound
                  ? 'bg-emerald-800/60 text-emerald-300 hover:bg-emerald-700/60'
                  : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
              }`}
              title="Change playback speed"
            >
              {playbackRate}x
            </button>
            <Mic className={`w-3 h-3 ${isOutbound ? 'text-emerald-400' : 'text-zinc-400'}`} />
          </div>
        </div>
      </div>
    </div>
  );
}
