/**
 * MediAI Assistant Message Bubble
 * Renders a single chat message with avatar, markdown-lite text, and timestamps.
 */

import { Bot, User } from 'lucide-react';
import type { AssistantMessage } from '@/store/assistantStore';

interface AssistantMessageProps {
  message: AssistantMessage;
}

/**
 * Render basic markdown-like formatting in text
 * Supports: **bold**, *italic*, newlines, bullet lists
 */
function renderContent(text: string): React.ReactNode {
  const lines = text.split('\n');
  return lines.map((line, lineIndex) => {
    // Bold
    const parts = line.split(/(\*\*.*?\*\*)/g);
    const rendered = parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
      }
      // Italic
      const italicParts = part.split(/(\*.*?\*)/g);
      return italicParts.map((ip, j) => {
        if (ip.startsWith('*') && ip.endsWith('*') && ip.length > 2) {
          return <em key={`${i}-${j}`}>{ip.slice(1, -1)}</em>;
        }
        return <span key={`${i}-${j}`}>{ip}</span>;
      });
    });

    return (
      <span key={lineIndex}>
        {rendered}
        {lineIndex < lines.length - 1 && <br />}
      </span>
    );
  });
}

function formatTime(date: Date): string {
  return new Date(date).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function AssistantMessageBubble({ message }: AssistantMessageProps) {
  const isUser = message.role === 'user';
  const isLoading = message.isLoading;

  if (isUser) {
    return (
      <div className="flex items-end justify-end gap-2 animate-slide-in-right">
        <div className="flex flex-col items-end gap-1 max-w-[80%]">
          <div className="bg-gradient-to-r from-teal-500 to-cyan-500 text-white px-4 py-2.5 rounded-2xl rounded-br-sm shadow-lg">
            <p className="text-sm leading-relaxed">{message.content}</p>
          </div>
          <span className="text-[10px] text-white/30 px-1">
            {formatTime(message.timestamp)}
          </span>
        </div>
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-teal-600/40 border border-teal-500/30 flex items-center justify-center mb-4">
          <User size={14} className="text-teal-300" />
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="flex items-end gap-2 animate-slide-in-left">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center mb-4 shadow-lg shadow-teal-500/30">
        <Bot size={14} className="text-white" />
      </div>
      <div className="flex flex-col items-start gap-1 max-w-[82%]">
        <div className="bg-white/8 backdrop-blur-sm border border-white/10 px-4 py-2.5 rounded-2xl rounded-bl-sm shadow-lg">
          {isLoading ? (
            <div className="flex items-center gap-1.5 py-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-teal-400"
                  style={{
                    animation: 'thinking-dot 1.2s ease-in-out infinite',
                    animationDelay: `${i * 0.2}s`,
                  }}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-white/85 leading-relaxed">
              {renderContent(message.content)}
            </p>
          )}
        </div>
        <span className="text-[10px] text-white/30 px-1">
          MediAI · {formatTime(message.timestamp)}
        </span>
      </div>
    </div>
  );
}
