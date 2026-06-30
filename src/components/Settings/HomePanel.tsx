import React, { useEffect, useState, useMemo } from 'react';
import { useI18n } from '../../i18n/context';

interface OverviewStats {
  totalDurationMs: number;
  totalCharCount: number;
  totalSessions: number;
  todayDurationMs: number;
  todayCharCount: number;
  todaySessions: number;
  recentDays: Array<{ date: string; durationMs: number; charCount: number }>;
}

interface HistoryEntry {
  id: string;
  text: string;
  charCount: number;
  timestamp: number;
}

// Split duration display — numbers big, units small (looks balanced next to pure-number metrics)
function DurationDisplay({ ms, t }: { ms: number; t: (k: string) => string }) {
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return <>{totalSec}<span className="home-dur-unit">{t('history.unit.seconds')}</span></>;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return <>{min}<span className="home-dur-unit">{t('history.unit.minutes')}</span> {sec}<span className="home-dur-unit">{t('history.unit.seconds')}</span></>;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fill7Days(days: Array<{ date: string; durationMs: number; charCount: number }>): Array<{ date: string; durationMs: number; charCount: number }> {
  const result: Array<{ date: string; durationMs: number; charCount: number }> = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const existing = days.find((x) => x.date === key);
    result.push(existing || { date: key, durationMs: 0, charCount: 0 });
  }
  return result;
}

export const HomePanel: React.FC = () => {
  const { t } = useI18n();
  const [data, setData] = useState<OverviewStats | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState(false);

  const load = async () => {
    const api = window.tingmo as any;
    const [overviewResult, historyResult] = await Promise.allSettled([
      api?.getOverview ? api.getOverview() : api?.getStats().then((s: any) => ({ ...s, todayDurationMs: 0, todayCharCount: 0, todaySessions: 0, recentDays: [] })),
      api?.getHistory ? api.getHistory() : Promise.resolve([]),
    ]);
    if (overviewResult.status === 'fulfilled') setData(overviewResult.value);
    else setError(true);
    if (historyResult.status === 'fulfilled') setHistory(historyResult.value);
    else setError(true);
  };

  useEffect(() => {
    load();
    const unsub = window.tingmo?.onRecognitionDone(() => load());
    return () => { unsub?.(); };
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return history;
    const q = search.toLowerCase();
    return history.filter((e) => e.text.toLowerCase().includes(q));
  }, [history, search]);

  const handleClear = async () => {
    await window.tingmo?.clearHistory();
    // Reload from source instead of clearing state optimistically
    load();
  };

  if (error || !data) {
    return (
      <section className="nb-section">
        <h2 className="nb-section-title"><span className="nb-tag accent">{t('nav.home')}</span></h2>
        <div className="nb-card">
          <p style={{ color: '#999', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
            {error ? t('overview.error') : t('overview.loading')}
          </p>
        </div>
      </section>
    );
  }

  const weekDays = fill7Days(data.recentDays);
  const maxChars = Math.max(...weekDays.map((d) => d.charCount), 1);
  const todayDate = weekDays[6]?.date.slice(5);

  return (
    <section className="nb-section">
      <h2 className="nb-section-title"><span className="nb-tag accent">{t('nav.home')}</span></h2>

      {/* ── Today Hero ── */}
      <div className="nb-card home-today-card" style={{ marginBottom: 12 }}>
        <div className="home-today-header">
          <span className="home-today-label">{t('overview.today')}</span>
          <span className="home-today-date">{todayDate}</span>
        </div>
        <div className="home-today-metrics">
          <div className="home-today-metric">
            <span className="home-today-number">{data.todaySessions}</span>
            <span className="home-today-unit">{t('overview.sessions')}</span>
          </div>
          <div className="home-today-divider" />
          <div className="home-today-metric">
            <span className="home-today-number"><DurationDisplay ms={data.todayDurationMs} t={t} /></span>
            <span className="home-today-unit">{t('overview.todayDuration')}</span>
          </div>
          <div className="home-today-divider" />
          <div className="home-today-metric home-today-primary">
            <span className="home-today-number accent">{data.todayCharCount.toLocaleString()}</span>
            <span className="home-today-unit">{t('overview.todayChars')}</span>
          </div>
        </div>
      </div>

      {/* ── Total ── */}
      <div className="nb-card" style={{ marginBottom: 12 }}>
        <div className="nb-row">
          <span className="nb-label">{t('overview.total')}</span>
          <span className="nb-value">{data.totalSessions} {t('overview.sessions')}</span>
        </div>
        <div className="nb-hr" />
        <div className="nb-row">
          <span className="nb-label">{t('history.totalDuration')}</span>
          <span className="nb-value">{Math.floor(Math.round(data.totalDurationMs / 1000) / 60)} <span style={{ color: '#999' }}>{t('history.unit.minutes').trim()}</span> {Math.round(data.totalDurationMs / 1000) % 60} <span style={{ color: '#999' }}>{t('history.unit.seconds').trim()}</span></span>
        </div>
        <div className="nb-hr" />
        <div className="nb-row">
          <span className="nb-label">{t('history.totalCharCount')}</span>
          <span className="nb-value">{data.totalCharCount.toLocaleString()}</span>
        </div>
      </div>

      {/* ── 7-day chart ── */}
      <div className="nb-card home-chart-card" style={{ marginBottom: 12 }}>
        <div className="nb-row" style={{ marginBottom: 4 }}>
          <span className="nb-label">{t('overview.last7Days')}</span>
        </div>
        <div className="home-chart">
          {weekDays.map((day) => {
            const height = maxChars > 0 ? Math.max(4, (day.charCount / maxChars) * 88) : 4;
            const isToday = day.date === weekDays[6]?.date;
            return (
              <div key={day.date} className="home-chart-col">
                <span className="home-chart-value">{day.charCount > 0 ? day.charCount : ''}</span>
                <div
                  className={`home-chart-bar ${isToday ? 'today' : ''} ${day.charCount === 0 ? 'zero' : ''}`}
                  style={{ height }}
                />
                <span className={`home-chart-date ${isToday ? 'today' : ''}`}>
                  {day.date.slice(5)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── History list ── */}
      {history.length > 0 && (
        <>
          <div className="nb-row" style={{ marginBottom: 8, gap: 8 }}>
            <input className="nb-input" type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('history.searchPlaceholder')} style={{ flex: 1 }} />
            <button className="nb-btn" onClick={handleClear}>{t('history.clear')}</button>
          </div>
          {filtered.length > 0 ? (
            <div className="nb-card" style={{ padding: 0 }}>
              {filtered.map((entry) => (
                <div key={entry.id} className="history-item">
                  <div className="history-meta">
                    <span>{formatTime(entry.timestamp)}</span>
                    <span style={{ color: '#FF5A1F' }}>{entry.charCount} {t('history.unit.characters')}</span>
                  </div>
                  <div className="history-text-row">
                    <div className="history-text">{entry.text}</div>
                    <button className="nb-btn" style={{ padding: '2px 8px', fontSize: 11, flexShrink: 0 }} onClick={() => window.tingmo?.copyText(entry.text)}>{t('history.copy')}</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="nb-card"><p style={{ color: '#999', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>{t('history.noResults')}</p></div>
          )}
        </>
      )}

      {history.length === 0 && (
        <div className="nb-card">
          <p style={{ color: '#999', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
            {t('history.empty')}
          </p>
        </div>
      )}
    </section>
  );
};
