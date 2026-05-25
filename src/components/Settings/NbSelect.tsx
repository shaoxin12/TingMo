import React, { useState, useRef, useEffect } from 'react';

interface Props {
  value: string;
  options: { value: string; label: string; icon?: React.ReactNode }[];
  onChange: (value: string) => void;
}

export const NbSelect: React.FC<Props> = ({ value, options, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const label = options.find((o) => o.value === value)?.label ?? value;
  const selectedIcon = options.find((o) => o.value === value)?.icon;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="nb-select-wrap" ref={ref}>
      <button
        className="nb-select-trigger"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {selectedIcon}
            <span>{label}</span>
          </span>
        <span className="nb-select-arrow" />
      </button>
      {open && (
        <div className="nb-select-dropdown">
          {options.map((o) => (
            <button
              key={o.value}
              className={`nb-select-opt ${o.value === value ? 'active' : ''}`}
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              {o.icon && <span style={{ marginRight: 6 }}>{o.icon}</span>}
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
