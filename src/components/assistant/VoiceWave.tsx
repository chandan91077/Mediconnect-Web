/**
 * MediAI Voice Wave Visualizer
 * Animated bar equalizer for voice activity feedback.
 */

interface VoiceWaveProps {
  isActive: boolean;
  barCount?: number;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
}

const HEIGHT_MAP = {
  sm: 'h-4',
  md: 'h-6',
  lg: 'h-8',
};

const BAR_WIDTH_MAP = {
  sm: 'w-0.5',
  md: 'w-1',
  lg: 'w-1.5',
};

export function VoiceWave({
  isActive,
  barCount = 5,
  color = '#2dd4bf',
  size = 'md',
}: VoiceWaveProps) {
  return (
    <div
      className={`flex items-center justify-center gap-0.5 ${HEIGHT_MAP[size]}`}
      aria-label={isActive ? 'Voice active' : 'Voice inactive'}
    >
      {Array.from({ length: barCount }).map((_, i) => (
        <div
          key={i}
          className={`${BAR_WIDTH_MAP[size]} rounded-full transition-all duration-150`}
          style={{
            backgroundColor: color,
            height: isActive ? undefined : '4px',
            minHeight: '4px',
            animation: isActive
              ? `voice-bar ${0.8 + i * 0.15}s ease-in-out infinite alternate`
              : 'none',
            animationDelay: `${i * 0.08}s`,
          }}
        />
      ))}
    </div>
  );
}
