import React, { useState, useCallback, useRef, useEffect, CSSProperties } from 'react';
import ReactDOM from 'react-dom';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DatePickerProps {
  value: string;                    // YYYY-MM-DD or ''
  onChange: (date: string) => void;
  placeholder?: string;
  min?: string;                     // YYYY-MM-DD — earliest selectable (defaults to today)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function toISO(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function formatDisplay(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// ─── Component ────────────────────────────────────────────────────────────────

export function DatePicker({
  value,
  onChange,
  placeholder = 'Select date',
  min,
}: DatePickerProps) {
  const earliest = min || todayISO();
  const today    = todayISO();

  const seedISO    = value || earliest;
  const [open, setOpen]           = useState(false);
  const [popupStyle, setPopupStyle] = useState<CSSProperties>({});
  const [viewYear, setViewYear]   = useState(() => parseInt(seedISO.slice(0, 4), 10));
  const [viewMonth, setViewMonth] = useState(() => parseInt(seedISO.slice(5, 7), 10) - 1);

  const triggerRef = useRef<HTMLButtonElement>(null);

  // Sync view when value changes externally
  useEffect(() => {
    if (value) {
      setViewYear(parseInt(value.slice(0, 4), 10));
      setViewMonth(parseInt(value.slice(5, 7), 10) - 1);
    }
  }, [value]);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const popup = document.querySelector('.dp__popup');
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        popup && !popup.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  // Recalculate popup position on scroll / resize
  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      setPopupStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        zIndex: 9999,
      });
    };
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  const handleToggle = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPopupStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        zIndex: 9999,
      });
    }
    setOpen(o => !o);
  };

  const prevMonth = useCallback(() => {
    setViewMonth(m => {
      if (m === 0) { setViewYear(y => y - 1); return 11; }
      return m - 1;
    });
  }, []);

  const nextMonth = useCallback(() => {
    setViewMonth(m => {
      if (m === 11) { setViewYear(y => y + 1); return 0; }
      return m + 1;
    });
  }, []);

  const handleDayClick = useCallback((iso: string) => {
    if (iso < earliest) return;
    onChange(iso);
    setOpen(false);
  }, [earliest, onChange]);

  const totalDays = daysInMonth(viewYear, viewMonth);
  const startPad  = firstDayOfWeek(viewYear, viewMonth);

  const popup = open ? (
    <div className="dp__popup" style={popupStyle} role="dialog" aria-label="Date picker" aria-modal="true">
      {/* Month header — reuses ddp styles */}
      <div className="ddp__header">
        <button type="button" className="ddp__nav-btn" onClick={prevMonth} aria-label="Previous month">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <span className="ddp__month-label">{MONTH_NAMES[viewMonth]} {viewYear}</span>
        <button type="button" className="ddp__nav-btn" onClick={nextMonth} aria-label="Next month">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* Calendar grid — reuses ddp styles */}
      <div className="ddp__grid" role="grid" aria-label={`${MONTH_NAMES[viewMonth]} ${viewYear}`}>
        {DAY_LABELS.map(d => (
          <div key={d} className="ddp__weekday" role="columnheader" aria-label={d}>{d}</div>
        ))}

        {Array.from({ length: startPad }, (_, i) => (
          <div key={`pad-${i}`} className="ddp__cell ddp__cell--empty" aria-hidden="true" />
        ))}

        {Array.from({ length: totalDays }, (_, i) => {
          const day = i + 1;
          const iso = toISO(viewYear, viewMonth, day);
          const isPast     = iso < earliest;
          const isToday    = iso === today;
          const isSelected = iso === value;

          const cellClasses = [
            'ddp__cell',
            isPast     && 'ddp__cell--past',
            isToday    && 'ddp__cell--today',
            isSelected && 'ddp__cell--start',
            !isPast    && 'ddp__cell--interactive',
          ].filter(Boolean).join(' ');

          return (
            <div
              key={iso}
              className={cellClasses}
              role="gridcell"
              aria-label={`${day} ${MONTH_NAMES[viewMonth]}`}
              aria-disabled={isPast}
              aria-selected={isSelected || undefined}
              tabIndex={isPast ? -1 : 0}
              onClick={isPast ? undefined : () => handleDayClick(iso)}
              onKeyDown={isPast ? undefined : (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleDayClick(iso); }
              }}
            >
              <span className="ddp__day-inner">{day}</span>
            </div>
          );
        })}
      </div>
    </div>
  ) : null;

  return (
    <div className="dp">
      <button
        ref={triggerRef}
        type="button"
        className={`dp__trigger${open ? ' dp__trigger--open' : ''}`}
        onClick={handleToggle}
        aria-label="Pick a date"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <svg className="dp__icon" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="1.5" y="3" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M5 1.5V4M11 1.5V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M1.5 7h13" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
        <span className={value ? '' : 'dp__placeholder'}>
          {value ? formatDisplay(value) : placeholder}
        </span>
      </button>

      {/* Portal: renders at document.body — escapes any overflow:hidden ancestor */}
      {ReactDOM.createPortal(popup, document.body)}
    </div>
  );
}
