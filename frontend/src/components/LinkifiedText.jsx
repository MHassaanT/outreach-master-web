import React from 'react';

/**
 * Regex matching URLs starting with http://, https://, or www.
 * Avoids trailing punctuation (. , ! ? ) ] } ")
 */
const URL_REGEX = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s]|www\.[^\s<]+[^<.,:;"')\]\s])/gi;

export default function LinkifiedText({ text, className = '' }) {
  if (!text) return null;

  const parts = [];
  let lastIndex = 0;
  let match;

  // Reset regex state
  URL_REGEX.lastIndex = 0;

  while ((match = URL_REGEX.exec(text)) !== null) {
    const matchedUrl = match[0];
    const matchIndex = match.index;

    // Push text preceding the URL
    if (matchIndex > lastIndex) {
      parts.push(text.substring(lastIndex, matchIndex));
    }

    // Determine destination href
    const href = matchedUrl.startsWith('http://') || matchedUrl.startsWith('https://')
      ? matchedUrl
      : `https://${matchedUrl}`;

    parts.push(
      <a
        key={`link-${matchIndex}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-cyan-400 hover:text-cyan-300 underline font-medium break-all transition-colors duration-150"
      >
        {matchedUrl}
      </a>
    );

    lastIndex = matchIndex + matchedUrl.length;
  }

  // Push remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return <span className={`whitespace-pre-line ${className}`}>{parts}</span>;
}
