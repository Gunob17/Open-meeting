import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { GuestVisit } from '../types';

export function ReceptionistPage() {
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(() => {
    const now = new Date();
    return now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0');
  });
  const [guests, setGuests] = useState<GuestVisit[]>([]);
  const [closingHour, setClosingHour] = useState<number>(18);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');

  const loadGuests = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getReceptionistGuests(date);
      setGuests(data.guests);
      setClosingHour(data.closingHour);
    } catch (err) {
      console.error('Failed to load guests:', err);
      setError(err instanceof Error ? err.message : 'Failed to load guests');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { loadGuests(); }, [loadGuests]);

  const handleCheckIn = async (visitId: string) => {
    setActionLoading(visitId);
    try {
      await api.checkInGuest(visitId);
      await loadGuests();
    } catch (err) {
      console.error('Failed to check in guest:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCheckOut = async (visitId: string) => {
    setActionLoading(visitId);
    try {
      await api.checkOutGuest(visitId);
      await loadGuests();
    } catch (err) {
      console.error('Failed to check out guest:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleUndoCheckIn = async (visitId: string) => {
    setActionLoading(visitId);
    try {
      await api.undoCheckInGuest(visitId);
      await loadGuests();
    } catch (err) {
      console.error('Failed to undo check in:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const changeDate = (offset: number) => {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + offset);
    setDate(d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0'));
  };

  const formatTime = (isoString: string | null) => {
    if (!isoString) return '-';
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getRowClass = (guest: GuestVisit) => {
    const isIn = !!guest.checkedInAt && !guest.checkedOutAt;
    const isOut = !!guest.checkedOutAt;

    if (isOut) return 'row-checked-out';
    if (!isIn) return '';

    // Guest is currently checked in - check for overstay
    const now = new Date();
    const effectiveClosingHour = guest.roomClosingHour ?? closingHour;
    const closingTime = new Date(date + 'T' + String(effectiveClosingHour).padStart(2, '0') + ':00:00');

    if (now >= closingTime) return 'row-overstay-closing';

    if (guest.bookingEndTime) {
      const meetingEnd = new Date(guest.bookingEndTime);
      if (now >= meetingEnd) return 'row-overstay-meeting';
    }

    return 'row-checked-in';
  };

  // Group guests by the organizer's company (the company of the user who invited them)
  const grouped = guests.reduce<Record<string, GuestVisit[]>>((acc, guest) => {
    const company = guest.organizerCompany || guest.guestCompany || 'No Company';
    if (!acc[company]) acc[company] = [];
    acc[company].push(guest);
    return acc;
  }, {});

  const sortedCompanies = Object.keys(grouped).sort((a, b) => {
    if (a === 'No Company') return 1;
    if (b === 'No Company') return -1;
    return a.localeCompare(b);
  });

  // Summary counts
  const totalGuests = guests.length;
  const checkedIn = guests.filter(g => g.checkedInAt && !g.checkedOutAt).length;
  const checkedOut = guests.filter(g => g.checkedOutAt).length;
  const pending = guests.filter(g => !g.checkedInAt).length;

  if (loading && guests.length === 0) {
    return <div className="loading">Loading guest data...</div>;
  }

  return (
    <div className="receptionist-page">
      <div className="page-header">
        <h1>Guest Management</h1>
        <div className="date-picker">
          <button className="btn btn-secondary btn-sm" onClick={() => changeDate(-1)} disabled={loading}>
            &#8249; Prev
          </button>
          <input
            id="guest-date"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
          <button className="btn btn-secondary btn-sm" onClick={() => changeDate(1)} disabled={loading}>
            Next &#8250;
          </button>
          <button className="btn btn-secondary btn-sm" onClick={loadGuests} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="guest-summary">
        <div className="summary-card">
          <div className="summary-number">{totalGuests}</div>
          <div className="summary-label">Total Guests</div>
        </div>
        <div className="summary-card summary-pending">
          <div className="summary-number">{pending}</div>
          <div className="summary-label">Pending</div>
        </div>
        <div className="summary-card summary-checked-in">
          <div className="summary-number">{checkedIn}</div>
          <div className="summary-label">Checked In</div>
        </div>
        <div className="summary-card summary-checked-out">
          <div className="summary-number">{checkedOut}</div>
          <div className="summary-label">Checked Out</div>
        </div>
      </div>

      {guests.length === 0 && !loading && (
        <div className="empty-state">
          <p>No external guests expected for this date.</p>
        </div>
      )}

      {sortedCompanies.map(company => (
        <div key={company} className="company-group">
          <div className="company-group-header">
            {company} <span className="company-guest-count">({grouped[company].length} guest{grouped[company].length !== 1 ? 's' : ''})</span>
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Guest Name</th>
                  <th>Email</th>
                  <th>Invited By</th>
                  <th>Meeting</th>
                  <th>Room</th>
                  <th>Expected</th>
                  <th>Check-in</th>
                  <th>Check-out</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {grouped[company].map(guest => {
                  const isPending = !guest.checkedInAt;
                  const isIn = !!guest.checkedInAt && !guest.checkedOutAt;
                  const isOut = !!guest.checkedOutAt;

                  return (
                    <tr key={guest.id} className={getRowClass(guest)}>
                      <td><strong>{guest.guestName}</strong></td>
                      <td>{guest.guestEmail || '-'}</td>
                      <td>{guest.organizerName || '-'}</td>
                      <td>{guest.bookingTitle || '-'}</td>
                      <td>{guest.roomName || '-'}</td>
                      <td>{formatTime(guest.expectedArrival)}</td>
                      <td>{formatTime(guest.checkedInAt)}</td>
                      <td>{formatTime(guest.checkedOutAt)}</td>
                      <td>
                        {isPending && <span className="guest-status pending">Pending</span>}
                        {isIn && <span className="guest-status checked-in">Checked In</span>}
                        {isOut && <span className="guest-status checked-out">Left</span>}
                      </td>
                      <td>
                        <div className="action-buttons">
                          {isPending && (
                            <button
                              className="btn btn-sm btn-success"
                              onClick={() => handleCheckIn(guest.id)}
                              disabled={actionLoading === guest.id}
                            >
                              {actionLoading === guest.id ? '...' : 'Check In'}
                            </button>
                          )}
                          {isIn && (
                            <>
                              <button
                                className="btn btn-sm btn-primary"
                                onClick={() => handleCheckOut(guest.id)}
                                disabled={actionLoading === guest.id}
                              >
                                {actionLoading === guest.id ? '...' : 'Check Out'}
                              </button>
                              <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => handleUndoCheckIn(guest.id)}
                                disabled={actionLoading === guest.id}
                              >
                                Undo
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
