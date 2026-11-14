'use client';
export default function Field({ label, error, children, hint }: { label?: any; error?: any; children?: any; hint?: any }) {
  return (
    <label>
      {label}
      {children}
      {hint && !error && <span className="muted small" style={{ fontWeight: 400 }}>{hint}</span>}
      {error && <span className="field-error" role="alert">{error}</span>}
    </label>
  );
}
