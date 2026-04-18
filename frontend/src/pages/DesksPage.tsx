import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import { api } from '../services/api';
import { Desk, DeskBooking, DeskQuotaStatus } from '../types';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { DeskDatePicker } from '../components/DeskDatePicker';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

type DateSelectionMode = 'single' | 'range' | 'multi';

const DESKS_PER_PAGE = 9;

export function DesksPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const showConfirm = useConfirm();
  const [desks, setDesks] = useState<Desk[]>([]);
  const [dateMode, setDateMode] = useState<DateSelectionMode>('single');
  const [rangeStart, setRangeStart] = useState<string>(todayISO());
  const [rangeEnd, setRangeEnd] = useState<string>('');
  const [bookingsForDate, setBookingsForDate] = useState<DeskBooking[]>([]);
  const [myBookings, setMyBookings] = useState<DeskBooking[]>([]);
  const [quota, setQuota] = useState<DeskQuotaStatus | null>(null);
  const [quotaNextMonth, setQuotaNextMonth] = useState<DeskQuotaStatus | null>(null);
  const [blockedWeekdays, setBlockedWeekdays] = useState<number[]>([]);
  const [weekStartDay, setWeekStartDay] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [bookingDeskId, setBookingDeskId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [bookingErrors, setBookingErrors] = useState<Record<string, string>>({});
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [multiDates, setMultiDates] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [bookingResult, setBookingResult] = useState<{
    succeeded: string[];
    failed: Array<{ date: string; error: string }>;
  } | null>(null);

  // ─── Derived values ───────────────────────────────────────────────────────

  // Track the month the user is currently viewing in the calendar (independent
  // of rangeStart so navigating months updates the quota display immediately).
  const [calendarViewMonth, setCalendarViewMonth] = useState<string>(() => todayISO().slice(0, 7));
  const currentMonth = calendarViewMonth;

  const nextMonthKey = (() => {
    const d = new Date(calendarViewMonth + '-02');
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 7);
  })();

  const selectedDates = useMemo(() => {
    if (dateMode === 'multi') return multiDates;
    if (dateMode === 'single') return rangeStart ? [rangeStart] : [];
    if (!rangeStart || !rangeEnd || rangeEnd < rangeStart) return [];
    const dates: string[] = [];
    const cursor = new Date(rangeStart + 'T00:00:00');
    const end = new Date(rangeEnd + 'T00:00:00');
    while (cursor <= end) {
      const y = cursor.getFullYear();
      const mo = String(cursor.getMonth() + 1).padStart(2, '0');
      const d = String(cursor.getDate()).padStart(2, '0');
      dates.push(`${y}-${mo}-${d}`);
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  }, [dateMode, rangeStart, rangeEnd, multiDates]);

  // In range/multi mode, skip closed days — they can't be booked and shouldn't
  // inflate quota counts or the "Book N Days" button label.
  const bookableDates = selectedDates.filter(date => {
    const [y, m, d] = date.split('-').map(Number);
    return !blockedWeekdays.includes(new Date(y, m - 1, d).getDay());
  });

  const totalSelectedDays = bookableDates.length;
  const selectedDaysThisMonth = bookableDates.filter(d => d.slice(0, 7) === currentMonth).length;
  const selectedDaysNextMonth = bookableDates.filter(d => d.slice(0, 7) === nextMonthKey).length;

  const effectiveEnd = dateMode === 'range' && rangeEnd && rangeEnd >= rangeStart ? rangeEnd : rangeStart;

  const isOverQuota =
    (quota !== null && quota.remainingThisMonth !== null && selectedDaysThisMonth > quota.remainingThisMonth) ||
    (selectedDaysNextMonth > 0 && quotaNextMonth !== null && quotaNextMonth.remainingThisMonth !== null &&
      selectedDaysNextMonth > quotaNextMonth.remainingThisMonth);

  const allDeskFeatures = [...new Set(desks.flatMap((d) => d.features ?? []))].sort();

  const visibleDesks = useMemo(() => {
    let result = desks;
    if (selectedFeatures.length > 0) {
      result = result.filter((d) => selectedFeatures.every((f) => (d.features ?? []).includes(f)));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (d) => d.name.toLowerCase().includes(q) || (d.floor ?? '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [desks, selectedFeatures, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(visibleDesks.length / DESKS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedDesks = visibleDesks.slice((safePage - 1) * DESKS_PER_PAGE, safePage * DESKS_PER_PAGE);

  // ─── Data loading ─────────────────────────────────────────────────────────

  const loadDesks = useCallback(async () => {
    try {
      const data = await api.getDesks(false);
      setDesks(data);
      return data;
    } catch (err: any) {
      if (err.status === 403) {
        setAccessDenied(true);
      }
      return [];
    }
  }, []);

  const loadBookingsForRange = useCallback(async (start: string, end: string) => {
    const bookings = await api.getDeskBookingsForPark(start, end);
    setBookingsForDate(bookings);
  }, []);

  const loadMyBookings = useCallback(async () => {
    const bookings = await api.getMyDeskBookings();
    setMyBookings(bookings);
  }, []);

  const loadQuota = useCallback(async (month: string) => {
    try {
      const status = await api.getDeskQuotaStatus(month);
      setQuota(status);
      // blockedWeekdays is park-level (same regardless of month) — keep in sync
      setBlockedWeekdays(status.blockedWeekdays ?? []);
      setWeekStartDay(status.weekStartDay ?? 1);
    } catch {
      setQuota(null);
    }
  }, []);

  const loadQuotaNextMonth = useCallback(async (month: string) => {
    try {
      const status = await api.getDeskQuotaStatus(month);
      setQuotaNextMonth(status);
    } catch {
      setQuotaNextMonth(null);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadDesks(),
        loadMyBookings(),
        loadBookingsForRange(rangeStart, rangeStart),
        loadQuota(currentMonth),
      ]);
    } catch (err) {
      console.error('Failed to load desk data:', err);
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset to page 1 whenever the filtered list changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedFeatures, dateMode, rangeStart, rangeEnd, multiDates]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!loading) {
      // For multi mode use the span from first to last selected date
      const multiStart = multiDates.length > 0 ? multiDates[0] : rangeStart;
      const multiEnd   = multiDates.length > 0 ? multiDates[multiDates.length - 1] : rangeStart;
      const loadStart  = dateMode === 'multi' ? multiStart : rangeStart;
      const loadEnd    = dateMode === 'multi' ? multiEnd   : effectiveEnd;
      loadBookingsForRange(loadStart, loadEnd).catch(console.error);

      if (selectedDaysNextMonth > 0 && nextMonthKey !== currentMonth) {
        loadQuotaNextMonth(nextMonthKey).catch(console.error);
      } else {
        setQuotaNextMonth(null);
      }
    }
  }, [rangeStart, rangeEnd, dateMode, multiDates]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload quota whenever the calendar view month changes (user navigates months).
  useEffect(() => {
    if (!loading) {
      loadQuota(calendarViewMonth).catch(console.error);
    }
  }, [calendarViewMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Event handlers ───────────────────────────────────────────────────────

  const handleBook = async (desk: Desk) => {
    setBookingDeskId(desk.id);
    setBookingErrors((prev) => ({ ...prev, [desk.id]: '' }));
    setBookingResult(null);

    const datesToBook = bookableDates.length > 0 ? bookableDates : [rangeStart];
    const succeeded: string[] = [];
    const failed: Array<{ date: string; error: string }> = [];

    for (const date of datesToBook) {
      try {
        await api.createDeskBooking(desk.id, date);
        succeeded.push(date);
      } catch (err: any) {
        failed.push({ date, error: err.message || 'Failed to book' });
      }
    }

    if (dateMode === 'range') {
      setBookingResult({ succeeded, failed });
    } else if (failed.length > 0) {
      setBookingErrors((prev) => ({ ...prev, [desk.id]: failed[0].error }));
    }

    await Promise.all([
      loadBookingsForRange(rangeStart, effectiveEnd),
      loadMyBookings(),
      loadQuota(currentMonth),
      ...(selectedDaysNextMonth > 0 ? [loadQuotaNextMonth(nextMonthKey)] : []),
    ]);

    // Clear selection after booking so old picks don't carry over to the next booking
    if (succeeded.length > 0) {
      if (dateMode === 'multi') {
        setMultiDates([]);
      } else if (dateMode === 'range') {
        setRangeEnd('');
      }
    }

    setBookingDeskId(null);
  };

  const handleFeatureToggle = (feature: string) => {
    setSelectedFeatures((prev) =>
      prev.includes(feature) ? prev.filter((f) => f !== feature) : [...prev, feature]
    );
  };

  const handleCancel = async (bookingId: string) => {
    if (!await showConfirm({ message: t('desks.cancelConfirm'), confirmLabel: t('desks.cancelConfirmLabel'), variant: 'warning' })) return;
    setCancellingId(bookingId);
    try {
      await api.cancelDeskBooking(bookingId);
      await Promise.all([
        loadBookingsForRange(rangeStart, effectiveEnd),
        loadMyBookings(),
        loadQuota(currentMonth),
      ]);
    } catch (err: any) {
      console.error('Failed to cancel desk booking:', err);
    } finally {
      setCancellingId(null);
    }
  };

  const upcomingMyBookings = myBookings.filter(
    (b) => b.status === 'confirmed' && b.bookingDate >= todayISO()
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="loading">{t('desks.loading')}</div>;
  }

  if (accessDenied) {
    return (
      <div className="rooms-page">
        <div className="page-header"><h1>{t('desks.title')}</h1></div>
        <div className="empty-state">
          <p>{t('desks.notAvailable')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rooms-page">
      <div className="page-header">
        <h1>{t('desks.title')}</h1>
      </div>

      <div className="desks-layout">
        {/* ── Sidebar: calendar + quota + feature filter ────────────── */}
        <div className="desks-sidebar">
          <DeskDatePicker
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            dateMode={dateMode}
            onDateModeChange={(mode) => {
              setDateMode(mode);
              if (mode === 'single' || mode === 'range') {
                setMultiDates([]);
                if (mode === 'single') setRangeEnd('');
              }
              if (mode === 'multi') {
                setRangeEnd('');
                setMultiDates(rangeStart ? [rangeStart] : []);
              }
              setBookingErrors({});
              setBookingResult(null);
            }}
            onRangeChange={(start, end) => {
              setRangeStart(start || todayISO());
              setRangeEnd(end);
              setBookingErrors({});
              setBookingResult(null);
            }}
            multiDates={multiDates}
            onMultiDatesChange={(dates) => {
              setMultiDates(dates);
              setBookingErrors({});
              setBookingResult(null);
            }}
            myBookedDates={myBookings.filter(b => b.status === 'confirmed').map(b => b.bookingDate)}
            quota={quota}
            quotaNextMonth={quotaNextMonth}
            blockedWeekdays={blockedWeekdays}
            weekStartDay={weekStartDay}
            onViewMonthChange={(month) => setCalendarViewMonth(month)}
          />

          {/* Desk search */}
          <div className="desks-search">
            <input
              type="search"
              className="form-input"
              placeholder={t('desks.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label={t('desks.searchAriaLabel')}
            />
          </div>

          {/* Quota card — only shown when a real limit is in place */}
          {quota && quota.monthlyQuota !== null && quota.remainingThisMonth !== null && (
            <div className="desks-quota-card">
              <div className="desks-quota-card__header">
                <span className="desks-quota-card__title">
                  {t('desks.quota', { month: new Date(currentMonth + '-02').toLocaleString(i18n.language, { month: 'long', year: 'numeric' }) })}
                </span>
                {quota.quotaType === 'per_company' && (
                  <span className="desks-quota-card__badge">{t('desks.shared')}</span>
                )}
              </div>

              <div className="desks-quota-card__main">
                <span className={[
                  'desks-quota-card__big-number',
                  quota.remainingThisMonth === 0 && 'desks-quota-card__big-number--zero',
                  quota.remainingThisMonth > 0 && quota.remainingThisMonth <= 3 && 'desks-quota-card__big-number--low',
                ].filter(Boolean).join(' ')}>
                  {quota.remainingThisMonth}
                </span>
                <span className="desks-quota-card__sub">
                  {t('desks.daysRemaining', { count: quota.remainingThisMonth, total: quota.monthlyQuota })}
                </span>
              </div>

              <div
                className="desks-quota-bar"
                role="progressbar"
                aria-valuenow={quota.usedThisMonth}
                aria-valuemax={quota.monthlyQuota}
                aria-label={t('desks.daysUsed', { used: quota.usedThisMonth, left: quota.remainingThisMonth })}
              >
                <div
                  className={[
                    'desks-quota-bar__fill',
                    quota.remainingThisMonth === 0 && 'desks-quota-bar__fill--full',
                    quota.remainingThisMonth > 0 && quota.remainingThisMonth <= 3 && 'desks-quota-bar__fill--low',
                  ].filter(Boolean).join(' ')}
                  style={{ width: `${Math.min(100, Math.round((quota.usedThisMonth / quota.monthlyQuota) * 100))}%` }}
                />
              </div>

              <p className="desks-quota-card__used">
                {t('desks.daysUsed', { used: quota.usedThisMonth, left: quota.remainingThisMonth })}
              </p>

              {isOverQuota && (
                <p className="desks-quota-card__warning">
                  {t('desks.quotaExceeded')}
                </p>
              )}
            </div>
          )}

          {/* Feature filter */}
          {allDeskFeatures.length > 0 && (
            <div className="desks-feature-filter">
              <p className="desks-feature-filter__label">{t('desks.filterFeatures')}</p>
              <div className="desks-feature-filter__chips">
                {allDeskFeatures.map((feature) => (
                  <label key={feature} className="amenity-checkbox-label">
                    <input
                      type="checkbox"
                      checked={selectedFeatures.includes(feature)}
                      onChange={() => handleFeatureToggle(feature)}
                    />
                    {feature}
                  </label>
                ))}
              </div>
              {selectedFeatures.length > 0 && (
                <button
                  className="btn btn-secondary"
                  style={{ marginTop: '0.5rem', padding: '0.25rem 0.75rem', fontSize: '0.8125rem' }}
                  onClick={() => setSelectedFeatures([])}
                >
                  {t('desks.clearFilters')}
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Main: availability grid + booking result ──────────────── */}
        <div className="desks-main">
          {/* Booking result banner (range mode) */}
          {bookingResult && dateMode === 'range' && (
            <div className={`alert ${bookingResult.failed.length === 0 ? 'alert-success' : bookingResult.succeeded.length === 0 ? 'alert-error' : 'alert-warning'}`}>
              {bookingResult.succeeded.length > 0 && (
                <p>{t('desks.bookedSuccess', { count: bookingResult.succeeded.length })}</p>
              )}
              {bookingResult.failed.length > 0 && (
                <p>{t('desks.bookedFailedOn', { dates: bookingResult.failed.map(f => format(parseISO(f.date), 'MMM d')).join(', '), error: bookingResult.failed[0].error })}</p>
              )}
            </div>
          )}

          <section className="bookings-section">
            <h2>
              {dateMode === 'single' || !rangeEnd || rangeEnd < rangeStart
                ? t('desks.availabilityDate', { date: format(parseISO(rangeStart), 'EEEE, MMMM d, yyyy') })
                : t('desks.availabilityRange', { from: format(parseISO(rangeStart), 'MMM d'), to: format(parseISO(rangeEnd), 'MMM d, yyyy') })}
            </h2>

            {visibleDesks.length === 0 ? (
              <div className="empty-state">
                <p>
                  {searchQuery.trim() || selectedFeatures.length > 0
                    ? t('desks.noDesks')
                    : t('desks.noDesksAvailable')}
                </p>
              </div>
            ) : (
              <div className="rooms-grid">
                {paginatedDesks.map((desk) => {
                  const deskBookings = bookingsForDate.filter(b => b.deskId === desk.id && b.status === 'confirmed');
                  const booking = deskBookings[0];
                  const isBookedByMe = dateMode === 'range'
                    ? deskBookings.some(b => b.userId === user?.id)
                    : booking?.userId === user?.id;
                  const isBookedByOther = dateMode === 'range'
                    ? deskBookings.some(b => b.userId !== user?.id)
                    : (!!booking && booking.userId !== user?.id);
                  const bookingError = bookingErrors[desk.id];
                  const statusLabel = isBookedByMe ? t('desks.bookedByYou') : isBookedByOther ? t('desks.occupied') : t('desks.available');
                  const statusClass = isBookedByMe || isBookedByOther ? 'occupied' : 'available';

                  return (
                    <div key={desk.id} className={`room-card ${statusClass}`}>
                      <div className="room-card-header">
                        <h3>{desk.name}</h3>
                        <span className={`status-badge ${statusClass}`}>{statusLabel}</span>
                      </div>

                      <div className="room-card-body">
                        {desk.floor && <p><strong>{t('desks.location')}:</strong> {desk.floor}</p>}
                        {desk.description && <p className="room-description">{desk.description}</p>}
                        {desk.features && desk.features.length > 0 && (
                          <div className="room-amenities" style={{ marginTop: '0.5rem' }}>
                            <div className="amenities-list">
                              {desk.features.map((f) => (
                                <span key={f} className="amenity-tag">{f}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {bookingError && (
                          <p style={{ color: '#ef4444', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                            {bookingError}
                          </p>
                        )}
                      </div>

                      <div className="room-card-footer">
                        {isBookedByOther ? (
                          <button className="btn btn-primary" disabled>{t('desks.occupied')}</button>
                        ) : dateMode === 'range' && isBookedByMe ? (
                          <button className="btn btn-secondary" disabled>{t('desks.alreadyBooked')}</button>
                        ) : isBookedByMe ? (
                          <button
                            className="btn btn-secondary"
                            onClick={() => handleCancel(booking!.id)}
                            disabled={cancellingId === booking!.id}
                          >
                            {cancellingId === booking!.id ? t('desks.cancelling') : t('desks.cancelBooking')}
                          </button>
                        ) : (
                          <button
                            className="btn btn-primary"
                            onClick={() => handleBook(desk)}
                            disabled={
                              bookingDeskId === desk.id ||
                              !!isOverQuota ||
                              (dateMode === 'range' && (!rangeEnd || rangeEnd < rangeStart))
                            }
                          >
                            {bookingDeskId === desk.id
                              ? t('desks.booking')
                              : isOverQuota
                              ? t('desks.quotaReached')
                              : dateMode === 'range' && totalSelectedDays > 1
                              ? t('desks.bookDays', { count: totalSelectedDays })
                              : t('desks.bookDesk')}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="desks-pagination">
                <button
                  className="btn btn-secondary desks-pagination__btn"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage(p => p - 1)}
                  aria-label={t('rooms.prevPage')}
                >
                  ‹
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    className={`desks-pagination__page${page === safePage ? ' desks-pagination__page--active' : ''}`}
                    onClick={() => setCurrentPage(page)}
                    aria-current={page === safePage ? 'page' : undefined}
                  >
                    {page}
                  </button>
                ))}
                <button
                  className="btn btn-secondary desks-pagination__btn"
                  disabled={safePage >= totalPages}
                  onClick={() => setCurrentPage(p => p + 1)}
                  aria-label={t('rooms.nextPage')}
                >
                  ›
                </button>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* My Upcoming Bookings — full width, below the two-column layout */}
      <section className="bookings-section">
        <h2>{t('desks.myUpcoming', { count: upcomingMyBookings.length })}</h2>

        {upcomingMyBookings.length === 0 ? (
          <p className="empty-message">{t('desks.noUpcoming')}</p>
        ) : (
          <div className="bookings-list">
            {upcomingMyBookings.map((booking) => (
              <div key={booking.id} className="booking-card">
                <div className="booking-card-header">
                  <h3>{booking.desk?.name ?? t('desks.title')}</h3>
                  <span className="status-badge confirmed">{t('myBookings.confirmed')}</span>
                </div>
                <div className="booking-card-body">
                  <p><strong>{t('desks.date')}:</strong> {format(parseISO(booking.bookingDate), 'EEEE, MMMM d, yyyy')}</p>
                  {booking.desk?.floor && <p><strong>{t('desks.location')}:</strong> {booking.desk.floor}</p>}
                </div>
                <div className="booking-card-footer">
                  <button
                    className="btn btn-danger"
                    onClick={() => handleCancel(booking.id)}
                    disabled={cancellingId === booking.id}
                  >
                    {cancellingId === booking.id ? t('desks.cancelling') : t('desks.cancelBooking')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
