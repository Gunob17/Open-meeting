import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { DeskQuotaStatus } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeskDatePickerProps {
  rangeStart: string;          // YYYY-MM-DD — always set (at least today)
  rangeEnd: string;            // YYYY-MM-DD or '' for single / pending-range
  dateMode: 'single' | 'range' | 'multi';
  onDateModeChange: (mode: 'single' | 'range' | 'multi') => void;
  onRangeChange: (start: string, end: string) => void;
  multiDates: string[];        // YYYY-MM-DD[] – multi-select mode picks
  onMultiDatesChange: (dates: string[]) => void;
  myBookedDates: string[];     // YYYY-MM-DD[] – user's confirmed bookings
  quota: DeskQuotaStatus | null;
  quotaNextMonth: DeskQuotaStatus | null;
  blockedWeekdays?: number[];  // 0=Sun … 6=Sat — days the park is closed
  weekStartDay?: number;       // 0=Sun, 1=Mon (default) … 6=Sat
  onViewMonthChange?: (month: string) => void; // YYYY-MM, fired when user navigates months
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Returns a YYYY-MM-DD string for the given year/month/day. */
function toISO(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Number of days in a given month (0-indexed). */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Returns the 0-based column position of the 1st of the month given a week
 * start day.  e.g. weekStart=1 (Mon) → Monday occupies column 0.
 */
function firstDayOfWeek(year: number, month: number, weekStart: number): number {
  const raw = new Date(year, month, 1).getDay(); // 0=Sun … 6=Sat
  return (raw - weekStart + 7) % 7;
}

/** Short human-readable label for a YYYY-MM-DD string. */
function formatDateLabel(iso: string, locale: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Returns the max bookable date as YYYY-MM-DD (3 months from today, same day). */
function maxBookableDate(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 3);
  return d.toISOString().slice(0, 10);
}

/** Number of calendar days between two ISO strings (inclusive). */
function daysBetween(start: string, end: string): number {
  const a = new Date(start + 'T00:00:00');
  const b = new Date(end + 'T00:00:00');
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DeskDatePicker({
  rangeStart,
  rangeEnd,
  dateMode,
  onDateModeChange,
  onRangeChange,
  multiDates,
  onMultiDatesChange,
  myBookedDates,
  quota,
  quotaNextMonth,
  blockedWeekdays = [],
  weekStartDay = 1,
  onViewMonthChange,
}: DeskDatePickerProps) {
  const { t, i18n } = useTranslation();

  const ALL_DAY_LABELS_RAW = Array.from({ length: 7 }, (_, i) => t(`dates.daysShort.${i}`));
  const MONTH_NAMES = Array.from({ length: 12 }, (_, i) => t(`dates.months.${i}`));

  // ── View month state ──────────────────────────────────────────────────────
  const initialISO = rangeStart || todayISO();
  const [viewYear, setViewYear]   = useState(() => parseInt(initialISO.slice(0, 4), 10));
  const [viewMonth, setViewMonth] = useState(() => parseInt(initialISO.slice(5, 7), 10) - 1);

  // Notify parent whenever the displayed month changes (skip initial render)
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return; }
    onViewMonthChange?.(`${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`);
  }, [viewYear, viewMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Hover preview state (range mode only) ────────────────────────────────
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  // ── Quota values ──────────────────────────────────────────────────────────
  // Always show quota for the current calendar month (not tied to view month).
  const remaining = quota?.monthlyQuota != null ? quota.remainingThisMonth : null;

  // ── Navigation ────────────────────────────────────────────────────────────
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

  // ── Click handler ─────────────────────────────────────────────────────────
  const handleDayClick = useCallback((iso: string) => {
    if (iso < todayISO()) return;  // past — blocked

    if (dateMode === 'single') {
      onRangeChange(iso, '');
      return;
    }

    if (dateMode === 'multi') {
      if (multiDates.includes(iso)) {
        onMultiDatesChange(multiDates.filter(d => d !== iso));
      } else {
        onMultiDatesChange([...multiDates, iso].sort());
      }
      return;
    }

    // Range mode:
    if (!rangeStart || rangeEnd || iso < rangeStart) {
      onRangeChange(iso, '');
    } else if (iso === rangeStart) {
      onRangeChange('', '');
    } else {
      onRangeChange(rangeStart, iso);
    }
    setHoverDate(null);
  }, [dateMode, rangeStart, rangeEnd, multiDates, onRangeChange, onMultiDatesChange]);

  // ── Mode switch ───────────────────────────────────────────────────────────
  const handleModeChange = (mode: 'single' | 'range' | 'multi') => {
    onDateModeChange(mode);
    if (mode === 'single') {
      // Preserve first selected date, drop everything else
      const seed = multiDates[0] || rangeStart || todayISO();
      onRangeChange(seed, '');
      onMultiDatesChange([]);
    } else if (mode === 'range') {
      const seed = multiDates[0] || rangeStart || todayISO();
      onRangeChange(seed, '');
      onMultiDatesChange([]);
    } else {
      // multi — seed from current rangeStart if any
      onMultiDatesChange(rangeStart ? [rangeStart] : []);
      onRangeChange(rangeStart || todayISO(), '');
    }
  };

  // ── Cell classifier ───────────────────────────────────────────────────────
  const today   = todayISO();
  const maxDate = maxBookableDate();

  // Derived: YYYY-MM of the max bookable date — used to cap navigation
  const maxViewMonth = maxDate.slice(0, 7);

  const visualEnd: string | null = (() => {
    if (dateMode === 'range' && rangeStart && !rangeEnd && hoverDate && hoverDate >= rangeStart) {
      return hoverDate;
    }
    if (dateMode === 'range' && rangeStart && rangeEnd && rangeEnd >= rangeStart) {
      return rangeEnd;
    }
    return null;
  })();

  function classifyDay(iso: string): {
    isPast: boolean;
    isToday: boolean;
    isSelected: boolean;
    isStart: boolean;
    isEnd: boolean;
    isMiddle: boolean;
    isBooked: boolean;
    isHoverPreview: boolean;
  } {
    const [y, mo, d] = iso.split('-').map(Number);
    const weekday = new Date(y, mo - 1, d).getDay();
    const isPast  = iso < today || iso > maxDate || blockedWeekdays.includes(weekday);
    const isToday = iso === today;

    // In multi mode each selected date is a "start" (gets the filled circle)
    const isStart = dateMode === 'multi'
      ? multiDates.includes(iso)
      : iso === rangeStart;

    const isEnd    = dateMode === 'range' && !!rangeEnd && iso === rangeEnd;
    const isMiddle = dateMode === 'range' && !!rangeStart && !!visualEnd
      && iso > rangeStart && iso < visualEnd;

    const isHoverPreview = !rangeEnd && dateMode === 'range'
      && !!rangeStart && !!hoverDate && !!(hoverDate >= rangeStart)
      && iso > rangeStart && iso < hoverDate;

    const isSelected = isStart || isEnd || isMiddle || isHoverPreview;
    const isBooked   = myBookedDates.includes(iso);

    return { isPast, isToday, isSelected, isStart, isEnd, isMiddle, isBooked, isHoverPreview };
  }

  // ── Calendar grid construction ────────────────────────────────────────────
  const totalDays = daysInMonth(viewYear, viewMonth);
  const startPad  = firstDayOfWeek(viewYear, viewMonth, weekStartDay);
  const DAY_LABELS = [...ALL_DAY_LABELS_RAW.slice(weekStartDay), ...ALL_DAY_LABELS_RAW.slice(0, weekStartDay)];

  // ── Selected date summary line ────────────────────────────────────────────
  const summaryLine: string | null = (() => {
    if (dateMode === 'multi') {
      if (multiDates.length === 0) return null;
      if (multiDates.length === 1) return formatDateLabel(multiDates[0], i18n.language);
      return t('deskDatePicker.daysSelected', { count: multiDates.length });
    }
    if (!rangeStart) return null;
    if (dateMode === 'single') return formatDateLabel(rangeStart, i18n.language);
    if (rangeStart && rangeEnd && rangeEnd >= rangeStart) {
      const count = daysBetween(rangeStart, rangeEnd);
      return `${formatDateLabel(rangeStart, i18n.language)} \u2013 ${formatDateLabel(rangeEnd, i18n.language)} \u00b7 ${t('deskDatePicker.rangeCount', { count })}`;
    }
    if (rangeStart && !rangeEnd) return `${formatDateLabel(rangeStart, i18n.language)}${t('deskDatePicker.pickEndDate')}`;
    return null;
  })();

  // ── Quota warning for this view-month ─────────────────────────────────────
  const quotaWarning: string | null = (() => {
    if (remaining === null || remaining === undefined) return null;
    if (remaining <= 0) return t('deskDatePicker.remainingZero');
    if (remaining <= 3) return t('deskDatePicker.remainingLow', { count: remaining });
    return null;
  })();

  const showClear =
    (dateMode === 'range' && rangeEnd && rangeEnd >= rangeStart) ||
    (dateMode === 'multi' && multiDates.length > 0);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="ddp">

      {/* ── Mode toggle ─────────────────────────────────────────────────── */}
      <div className="ddp__mode-row">
        <div className="ddp__mode-toggle" role="group" aria-label={t('deskDatePicker.modeGroup')}>
          <button
            type="button"
            className={`ddp__mode-btn${dateMode === 'single' ? ' ddp__mode-btn--active' : ''}`}
            onClick={() => handleModeChange('single')}
          >
            {t('deskDatePicker.single')}
          </button>
          <button
            type="button"
            className={`ddp__mode-btn${dateMode === 'range' ? ' ddp__mode-btn--active' : ''}`}
            onClick={() => handleModeChange('range')}
          >
            {t('deskDatePicker.range')}
          </button>
          <button
            type="button"
            className={`ddp__mode-btn${dateMode === 'multi' ? ' ddp__mode-btn--active' : ''}`}
            onClick={() => handleModeChange('multi')}
          >
            {t('deskDatePicker.multiDay')}
          </button>
        </div>

        {/* Quota pill */}
        {quota && quota.monthlyQuota !== null && remaining !== undefined && remaining !== null && (
          <span className={`ddp__quota-pill${remaining <= 0 ? ' ddp__quota-pill--empty' : remaining <= 3 ? ' ddp__quota-pill--low' : ''}`}>
            {remaining <= 0
              ? t('deskDatePicker.quotaFull')
              : t('deskDatePicker.quotaLeft', { remaining, total: quota.monthlyQuota })}
          </span>
        )}
      </div>

      {/* ── Calendar header ──────────────────────────────────────────────── */}
      <div className="ddp__header">
        <button
          type="button"
          className="ddp__nav-btn"
          onClick={prevMonth}
          aria-label={t('deskDatePicker.prevMonth')}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        <span className="ddp__month-label">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>

        <button
          type="button"
          className="ddp__nav-btn"
          onClick={nextMonth}
          disabled={`${viewYear}-${String(viewMonth + 1).padStart(2, '0')}` >= maxViewMonth}
          aria-label={t('deskDatePicker.nextMonth')}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* ── Weekday labels + day cells ───────────────────────────────────── */}
      <div className="ddp__grid" role="grid" aria-label={`${MONTH_NAMES[viewMonth]} ${viewYear}`}>
        {DAY_LABELS.map(d => (
          <div key={d} className="ddp__weekday" role="columnheader" aria-label={d}>
            {d}
          </div>
        ))}

        {Array.from({ length: startPad }, (_, i) => (
          <div key={`pad-${i}`} className="ddp__cell ddp__cell--empty" aria-hidden="true" />
        ))}

        {Array.from({ length: totalDays }, (_, i) => {
          const day = i + 1;
          const iso = toISO(viewYear, viewMonth, day);
          const {
            isPast, isToday, isStart, isEnd, isMiddle,
            isBooked, isHoverPreview,
          } = classifyDay(iso);

          const isInteractive = !isPast;

          const cellClasses = [
            'ddp__cell',
            isPast         && 'ddp__cell--past',
            isToday        && 'ddp__cell--today',
            isStart        && 'ddp__cell--start',
            isEnd          && 'ddp__cell--end',
            isMiddle       && 'ddp__cell--middle',
            isHoverPreview && 'ddp__cell--hover-mid',
            isInteractive  && 'ddp__cell--interactive',
            (isStart && dateMode === 'range' && (rangeEnd || hoverDate)) && 'ddp__cell--cap-left',
            (isEnd   && dateMode === 'range') && 'ddp__cell--cap-right',
          ].filter(Boolean).join(' ');

          return (
            <div
              key={iso}
              className={cellClasses}
              role="gridcell"
              aria-label={`${day} ${MONTH_NAMES[viewMonth]}`}
              aria-disabled={isPast}
              aria-selected={(isStart || isEnd) || undefined}
              tabIndex={isInteractive ? 0 : -1}
              onClick={isInteractive ? () => handleDayClick(iso) : undefined}
              onMouseEnter={
                isInteractive && dateMode === 'range' && rangeStart && !rangeEnd
                  ? () => setHoverDate(iso)
                  : undefined
              }
              onMouseLeave={
                isInteractive && dateMode === 'range' && rangeStart && !rangeEnd
                  ? () => setHoverDate(null)
                  : undefined
              }
              onKeyDown={
                isInteractive
                  ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleDayClick(iso); } }
                  : undefined
              }
            >
              <span className="ddp__day-inner">{day}</span>
              {isBooked && <span className="ddp__booked-dot" aria-label={t('deskDatePicker.bookedDot')} />}
            </div>
          );
        })}
      </div>

      {/* ── Quota warning strip ──────────────────────────────────────────── */}
      {quotaWarning && (
        <div className={`ddp__quota-warning${remaining === 0 ? ' ddp__quota-warning--empty' : ''}`} role="status">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M8 5v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="8" cy="11.5" r="0.75" fill="currentColor"/>
          </svg>
          {quotaWarning}
        </div>
      )}

      {/* ── Selection summary ────────────────────────────────────────────── */}
      {(summaryLine || showClear) && (
        <div className="ddp__summary" aria-live="polite">
          {summaryLine && <span className="ddp__summary-text">{summaryLine}</span>}
          {showClear && (
            <button
              type="button"
              className="ddp__clear-btn"
              onClick={() => {
                if (dateMode === 'multi') {
                  onMultiDatesChange([]);
                } else {
                  onRangeChange(todayISO(), '');
                }
              }}
            >
              {t('deskDatePicker.clear')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
