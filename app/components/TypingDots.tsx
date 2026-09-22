// Animated "..." bubble for chat-style AI replies (UbaAssistant, SupportAssistant)
// — three bouncing dots instead of static text, so a slow reply still feels alive.
export default function TypingDots() {
  return (
    <span className="typing-dots" aria-label="Thinking...">
      <span />
      <span />
      <span />
    </span>
  );
}
