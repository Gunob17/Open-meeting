import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { format, subDays } from 'date-fns';

interface RoomStat {
  roomId: string;
  roomName: string;
  floor: string;
  capacity: number;
  amenities: string[];
  totalBookings: number;
  totalHoursBooked: number;
  utilizationRate: number;
  averageBookingDuration: number;
  uniqueBookers: number;
  cancellationCount: number;
}

interface HourlyStat {
  hour: number;
  bookingCount: number;
}

interface DailyStat {
  date: string;
  bookingCount: number;
  totalHours: number;
}

interface AmenityStat {
  amenity: string;
  roomCount: number;
  totalBookings: number;
  averageUtilization: number;
}

interface TopBooker {
  userId: string;
  userName: string;
  userEmail: string;
  companyName: string;
  bookingCount: number;
  totalHoursBooked: number;
}

interface Summary {
  today: { bookings: number };
  thisWeek: { bookings: number };
  thisMonth: { bookings: number };
  totals: { activeRooms: number; activeUsers: number };
}

export function StatisticsPage() {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    start: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd')
  });

  // Data states
  const [summary, setSummary] = useState<Summary | null>(null);
  const [roomStats, setRoomStats] = useState<RoomStat[]>([]);
  const [roomSummary, setRoomSummary] = useState({ totalRooms: 0, totalBookings: 0, averageUtilization: 0 });
  const [hourlyStats, setHourlyStats] = useState<HourlyStat[]>([]);
  const [peakHour, setPeakHour] = useState({ hour: 0, bookings: 0 });
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [amenityStats, setAmenityStats] = useState<AmenityStat[]>([]);
  const [topBookers, setTopBookers] = useState<TopBooker[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryData, roomData, hourlyData, dailyData, amenityData, bookersData] = await Promise.all([
        api.getStatisticsSummary(),
        api.getRoomStatistics(dateRange.start, dateRange.end),
        api.getHourlyStatistics(dateRange.start, dateRange.end),
        api.getDailyStatistics(dateRange.start, dateRange.end),
        api.getAmenityStatistics(dateRange.start, dateRange.end),
        api.getTopBookers(dateRange.start, dateRange.end, undefined, 10)
      ]);

      setSummary(summaryData);
      setRoomStats(roomData.rooms);
      setRoomSummary(roomData.summary);
      setHourlyStats(hourlyData.hourlyStats);
      setPeakHour({ hour: hourlyData.peakHour, bookings: hourlyData.peakHourBookings });
      setDailyStats(dailyData.dailyStats);
      setAmenityStats(amenityData.amenityStats);
      setTopBookers(bookersData.topBookers);
    } catch (error) {
      console.error('Failed to load statistics:', error);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const formatHour = (hour: number): string => {
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}${suffix}`;
  };

  const getUtilizationColor = (rate: number): string => {
    if (rate >= 70) return '#059669'; // green
    if (rate >= 40) return '#d97706'; // amber
    return '#dc2626'; // red
  };

  const maxHourlyBookings = Math.max(...hourlyStats.map(h => h.bookingCount), 1);
  const maxDailyBookings = Math.max(...dailyStats.map(d => d.bookingCount), 1);

  if (loading) {
    return <div className="loading">Loading statistics...</div>;
  }

  return (
    <div className="statistics-page">
      <div className="page-header">
        <h1>Room Statistics</h1>
        <div className="date-range-picker">
          <label>
            From:
            <input
              type="date"
              value={dateRange.start}
              onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
            />
          </label>
          <label>
            To:
            <input
              type="date"
              value={dateRange.end}
              onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
            />
          </label>
          <button className="btn btn-primary" onClick={loadData}>
            Update
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="stats-summary-grid">
          <div className="stat-card highlight">
            <div className="stat-value">{summary.today.bookings}</div>
            <div className="stat-label">Bookings Today</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{summary.thisWeek.bookings}</div>
            <div className="stat-label">This Week</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{summary.thisMonth.bookings}</div>
            <div className="stat-label">This Month</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{summary.totals.activeRooms}</div>
            <div className="stat-label">Active Rooms</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{summary.totals.activeUsers}</div>
            <div className="stat-label">Active Users</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{roomSummary.averageUtilization}%</div>
            <div className="stat-label">Avg Utilization</div>
          </div>
        </div>
      )}

      {/* Two Column Layout */}
      <div className="stats-two-column">
        {/* Left Column - Charts */}
        <div className="stats-column">
          {/* Hourly Distribution */}
          <div className="stats-section">
            <h2>Booking Times Distribution</h2>
            <p className="stats-subtitle">
              Peak hour: <strong>{formatHour(peakHour.hour)}</strong> ({peakHour.bookings} bookings)
            </p>
            <div className="hourly-chart">
              {hourlyStats.filter(h => h.hour >= 6 && h.hour <= 20).map(stat => (
                <div key={stat.hour} className="hour-bar-container">
                  <div
                    className="hour-bar"
                    style={{
                      height: `${(stat.bookingCount / maxHourlyBookings) * 100}%`,
                      minHeight: stat.bookingCount > 0 ? '4px' : '0',
                      backgroundColor: stat.hour === peakHour.hour ? '#4f46e5' : '#94a3b8'
                    }}
                    title={`${formatHour(stat.hour)}: ${stat.bookingCount} bookings`}
                  />
                  <span className="hour-label">{stat.hour}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Daily Trend */}
          <div className="stats-section">
            <h2>Daily Booking Trend</h2>
            <div className="daily-chart">
              {dailyStats.slice(-14).map(stat => (
                <div key={stat.date} className="day-bar-container">
                  <div
                    className="day-bar"
                    style={{
                      height: `${(stat.bookingCount / maxDailyBookings) * 100}%`,
                      minHeight: stat.bookingCount > 0 ? '4px' : '0'
                    }}
                    title={`${format(new Date(stat.date), 'MMM d')}: ${stat.bookingCount} bookings, ${stat.totalHours}h`}
                  />
                  <span className="day-label">{format(new Date(stat.date), 'd')}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Amenity Popularity */}
          <div className="stats-section">
            <h2>Amenity Popularity</h2>
            <div className="amenity-stats">
              {amenityStats.slice(0, 8).map(stat => (
                <div key={stat.amenity} className="amenity-stat-row">
                  <span className="amenity-name">{stat.amenity}</span>
                  <div className="amenity-bar-bg">
                    <div
                      className="amenity-bar"
                      style={{
                        width: `${Math.min((stat.totalBookings / (amenityStats[0]?.totalBookings || 1)) * 100, 100)}%`
                      }}
                    />
                  </div>
                  <span className="amenity-count">{stat.totalBookings}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column - Tables */}
        <div className="stats-column">
          {/* Room Performance */}
          <div className="stats-section">
            <h2>Room Performance</h2>
            <div className="table-container compact">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Room</th>
                    <th>Bookings</th>
                    <th>Hours</th>
                    <th>Utilization</th>
                  </tr>
                </thead>
                <tbody>
                  {roomStats.slice(0, 10).map(room => (
                    <tr key={room.roomId}>
                      <td>
                        <div className="room-name">{room.roomName}</div>
                        <div className="room-floor">Floor {room.floor}</div>
                      </td>
                      <td>{room.totalBookings}</td>
                      <td>{room.totalHoursBooked}h</td>
                      <td>
                        <div className="utilization-cell">
                          <div className="utilization-bar-bg">
                            <div
                              className="utilization-bar"
                              style={{
                                width: `${Math.min(room.utilizationRate, 100)}%`,
                                backgroundColor: getUtilizationColor(room.utilizationRate)
                              }}
                            />
                          </div>
                          <span className="utilization-value">{room.utilizationRate}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top Bookers */}
          <div className="stats-section">
            <h2>Top Bookers</h2>
            <div className="table-container compact">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Company</th>
                    <th>Bookings</th>
                    <th>Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {topBookers.map(booker => (
                    <tr key={booker.userId}>
                      <td>
                        <div className="user-name">{booker.userName}</div>
                        <div className="user-email">{booker.userEmail}</div>
                      </td>
                      <td>{booker.companyName}</td>
                      <td>{booker.bookingCount}</td>
                      <td>{booker.totalHoursBooked}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Low Utilization Rooms */}
          <div className="stats-section">
            <h2>Underutilized Rooms</h2>
            <p className="stats-subtitle">Rooms with less than 30% utilization</p>
            <div className="underutilized-rooms">
              {roomStats
                .filter(r => r.utilizationRate < 30)
                .slice(0, 5)
                .map(room => (
                  <div key={room.roomId} className="underutilized-room-card">
                    <div className="room-info">
                      <strong>{room.roomName}</strong>
                      <span>Floor {room.floor} | Capacity: {room.capacity}</span>
                    </div>
                    <div className="room-stats">
                      <span className="utilization-low">{room.utilizationRate}%</span>
                      <span>{room.totalBookings} bookings</span>
                    </div>
                    <div className="room-amenities">
                      {room.amenities.slice(0, 3).map(a => (
                        <span key={a} className="amenity-tag small">{a}</span>
                      ))}
                    </div>
                  </div>
                ))}
              {roomStats.filter(r => r.utilizationRate < 30).length === 0 && (
                <p className="no-data">All rooms have good utilization!</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
