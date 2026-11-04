import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';
import { formatDuration } from '../../utils/audio';

interface AudioMessagePlayerProps {
  mediaUrl: string;
  duration?: number;
  isOutgoing: boolean;
  avatar?: string;
}

export const AudioMessagePlayer: React.FC<AudioMessagePlayerProps> = ({
  mediaUrl,
  duration = 0,
  isOutgoing,
  avatar,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration || 0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setAudioDuration(audio.duration);
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [mediaUrl]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {
        // Fallback simulation timer if audio element can't play blob in iframe
        simulatePlayback();
      });
    }
  };

  const simulatePlayback = () => {
    setIsPlaying(true);
    const total = audioDuration || 3;
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      if (elapsed >= total) {
        clearInterval(interval);
        setIsPlaying(false);
        setCurrentTime(0);
      } else {
        setCurrentTime(elapsed);
      }
    }, 100);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const newTime = pos * (audioDuration || 1);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
    setCurrentTime(newTime);
  };

  // 18 pseudo waveform bars
  const bars = [35, 60, 45, 80, 65, 95, 70, 50, 85, 100, 60, 75, 90, 40, 70, 85, 50, 65];
  const progressRatio = audioDuration > 0 ? currentTime / audioDuration : 0;

  return (
    <div className="flex items-center gap-3 py-1 min-w-[210px] sm:min-w-[260px]">
      {/* Hidden audio element */}
      {mediaUrl && <audio ref={audioRef} src={mediaUrl} preload="metadata" />}

      {/* Avatar in audio bubble */}
      {avatar && (
        <img
          src={avatar}
          alt="Avatar"
          className="w-10 h-10 rounded-full object-cover shrink-0 border border-white/20"
          referrerPolicy="no-referrer"
        />
      )}

      {/* Play/Pause Button */}
      <button
        type="button"
        onClick={togglePlay}
        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 cursor-pointer shadow-xs ${
          isOutgoing
            ? 'bg-white text-blue-600 hover:bg-blue-50'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}
      >
        {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 ml-0.5 fill-current" />}
      </button>

      {/* Waveform & Scrubber */}
      <div className="flex-1 min-w-0">
        <div
          onClick={handleSeek}
          className="h-8 flex items-center gap-[3px] cursor-pointer group py-1"
          title="Clique para avançar/retroceder"
        >
          {bars.map((heightPercent, idx) => {
            const barRatio = idx / bars.length;
            const isPlayed = barRatio <= progressRatio;

            return (
              <span
                key={idx}
                style={{ height: `${heightPercent}%` }}
                className={`w-1 rounded-full transition-all duration-100 ${
                  isOutgoing
                    ? isPlayed
                      ? 'bg-white opacity-100'
                      : 'bg-white/40 group-hover:bg-white/60'
                    : isPlayed
                    ? 'bg-blue-600 opacity-100'
                    : 'bg-slate-300 group-hover:bg-slate-400'
                }`}
              />
            );
          })}
        </div>

        {/* Timers */}
        <div className={`flex items-center justify-between text-[11px] font-medium leading-none ${
          isOutgoing ? 'text-blue-100' : 'text-slate-500'
        }`}>
          <span>{formatDuration(currentTime > 0 ? currentTime : audioDuration)}</span>
          <span className="text-[10px] opacity-75">Áudio de voz</span>
        </div>
      </div>
    </div>
  );
};
