import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import { format, subDays } from 'date-fns';
import { useSettings } from '../context/SettingsContext';
import { formatHour } from '../utils/time';

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
  const { t } = useTranslation();
  const { timeFormat } = useSettings();
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

  const getUtilizationColor = (rate: number): string => {
    if (rate >= 70) return '#059669'; // green
    if (rate >= 40) return '#d97706'; // amber
    return '#dc2626'; // red
  };

  const maxHourlyBookings = Math.max(...hourlyStats.map(h => h.bookingCount), 1);
  const maxDailyBookings = Math.max(...dailyStats.map(d => d.bookingCount), 1);

  if (loading) {
    return <div className="loading">{t('statistics.loading')}</div>;
  }

  return (
    <div className="statistics-page">
      <div className="page-header">
        <h1>{t('statistics.title')}</h1>
        <div className="date-range-picker">
          <label>
            {t('statistics.from')}:
            <input
              type="date"
              value={dateRange.start}
              onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
            />
          </label>
          <label>
            {t('statistics.to')}:
            <input
              type="date"
              value={dateRange.end}
              onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
            />
          </label>
          <button className="btn btn-primary" onClick={loadData}>
            {t('statistics.update')}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="stats-summary-grid">
          <div className="stat-card highlight">
            <div className="stat-value">{summary.today.bookings}</div>
            <div className="stat-label">{t('statistics.bookingsToday')}</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{summary.thisWeek.bookings}</div>
            <div className="stat-label">{t('statistics.thisWeek')}</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{summary.thisMonth.bookings}</div>
            <div className="stat-label">{t('statistics.thisMonth')}</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{summary.totals.activeRooms}</div>
            <div className="stat-label">{t('statistics.activeRooms')}</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{summary.totals.activeUsers}</div>
            <div className="stat-label">{t('statistics.activeUsers')}</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{roomSummary.averageUtilization}%</div>
            <div className="stat-label">{t('statistics.avgUtilization')}</div>
          </div>
        </div>
      )}

      {/* Two Column Layout */}
      <div className="stats-two-column">
        {/* Left Column - Charts */}
        <div className="stats-column">
          {/* Hourly Distribution */}
          <div className="stats-section">
            <h2>{t('statistics.bookingTimesTitle')}</h2>
            <p className="stats-subtitle">
              {t('statistics.peakHour', { hour: formatHour(peakHour.hour, timeFormat), count: peakHour.bookings })}
            </p>
            <div className="hourly-chart">
              {hourlyStats.filter(h => h.hour >= 6 && h.hour <= 20).map(stat => (
                <div key={stat.hour} className="hour-bar-container">
                  <div
                    className="hour-bar"
                    style={{
                      height: `${Math.round((stat.bookingCount / maxHourlyBookings) * 110)}px`,
                      minHeight: stat.bookingCount > 0 ? '4px' : '0',
                      backgroundColor: stat.hour === peakHour.hour ? '#4f46e5' : '#94a3b8'
                    }}
                    title={`${formatHour(stat.hour, timeFormat)}: ${stat.bookingCount} bookings`}
                  />
                  <span className="hour-label">{stat.hour}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Daily Trend */}
          <div className="stats-section">
            <h2>{t('statistics.dailyTrend')}</h2>
            <div className="daily-chart">
              {dailyStats.slice(-14).map(stat => (
                <div key={stat.date} className="day-bar-container">
                  <div
                    className="day-bar"
                    style={{
                      height: `${Math.round((stat.bookingCount / maxDailyBookings) * 85)}px`,
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
            <h2>{t('statistics.amenityPopularity')}</h2>
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
            <h2>{t('statistics.roomPerformance')}</h2>
            <div className="table-container compact">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('statistics.room')}</th>
                    <th>{t('statistics.bookings')}</th>
                    <th>{t('statistics.hours')}</th>
                    <th>{t('statistics.utilization')}</th>
                  </tr>
                </thead>
                <tbody>
                  {roomStats.slice(0, 10).map(room => (
                    <tr key={room.roomId}>
                      <td>
                        <div className="room-name">{room.roomName}</div>
                        <div className="room-floor">{t('common.floor')} {room.floor}</div>
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
            <h2>{t('statistics.topBookers')}</h2>
            <div className="table-container compact">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('statistics.userId')}</th>
                    <th>{t('statistics.company')}</th>
                    <th>{t('statistics.bookings')}</th>
                    <th>{t('statistics.hours')}</th>
                  </tr>
                </thead>
                <tbody>
                  {topBookers.map(booker => (
                    <tr key={booker.userId}>
                      <td>
                        <div className="user-name">{booker.userId.substring(0, 8)}…</div>
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
            <h2>{t('statistics.underutilized')}</h2>
            <p className="stats-subtitle">{t('statistics.underutilizedDesc')}</p>
            <div className="underutilized-rooms">
              {roomStats
                .filter(r => r.utilizationRate < 30)
                .slice(0, 5)
                .map(room => (
                  <div key={room.roomId} className="underutilized-room-card">
                    <div className="room-info">
                      <strong>{room.roomName}</strong>
                      <span>{t('common.floor')} {room.floor} | {t('common.capacity')}: {room.capacity}</span>
                    </div>
                    <div className="room-stats">
                      <span className="utilization-low">{room.utilizationRate}%</span>
                      <span>{room.totalBookings} {t('statistics.bookings').toLowerCase()}</span>
                    </div>
                    <div className="room-amenities">
                      {room.amenities.slice(0, 3).map(a => (
                        <span key={a} className="amenity-tag small">{a}</span>
                      ))}
                    </div>
                  </div>
                ))}
              {roomStats.filter(r => r.utilizationRate < 30).length === 0 && (
                <p className="no-data">{t('statistics.allGoodUtilization')}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
