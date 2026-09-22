// Small spinning ring to pair with "Analyzing...", "Drafting...", etc. button
// labels — gives a visible sign of progress instead of just changed text.
export default function AiSpinner({ className = "" }: { className?: string }) {
  return <span className={`ai-spinner ${className}`} aria-hidden="true" />;
}
