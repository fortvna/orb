import { useEffect, useMemo, useState } from "react";
import { evaluateOnFeed, fetchChart, fetchQuotes, fetchSessions } from "./feed";
import { aggregateBars, generateMinuteBars, getSession } from "./generate";
import { barsOnDate, resampleBars, sessionsFromIntraday } from "./session";
import type { Bar, ChartFeed, FeedInterval, FeedRange, Playbook, PlaybookEvaluation, Quote, SessionDay } from "./types";

export function useQuotes(ids: string[], intervalMs = 12000) {
  const key = ids.join(",");
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    async function tick() {
      const res = await fetchQuotes({ data: { ids } });
      if (stop) return;
      if (res.ok) {
        setQuotes(res.quotes);
        setLive(true);
        setError(null);
      } else {
        setError(res.error);
      }
    }
    void tick();
    const id = window.setInterval(() => void tick(), intervalMs);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [key, intervalMs]);

  return { quotes, live, error };
}

export function useChart(id: string, interval: FeedInterval, range: FeedRange, intervalMs = 12000) {
  const [chart, setChart] = useState<ChartFeed | null>(null);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stop = false;
    setLoading(true);
    async function tick() {
      const res = await fetchChart({ data: { id, interval, range } });
      if (stop) return;
      setLoading(false);
      if (res.ok) {
        setChart(res.chart);
        setLive(true);
        setError(null);
      } else {
        setError(res.error);
      }
    }
    void tick();
    const poll = range === "1d" || range === "5d" ? intervalMs : Math.max(intervalMs, 60_000);
    const handle = window.setInterval(() => void tick(), poll);
    return () => {
      stop = true;
      window.clearInterval(handle);
    };
  }, [id, interval, range, intervalMs]);

  return { chart, live, error, loading };
}

export function useSessions(id: string, days = 40) {
  const [sessions, setSessions] = useState<SessionDay[]>([]);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stop = false;
    setLoading(true);
    void fetchSessions({ data: { id, days } }).then((res) => {
      if (stop) return;
      setLoading(false);
      if (res.ok) {
        setSessions(res.sessions);
        setLive(true);
        setError(null);
      } else setError(res.error);
    });
    return () => {
      stop = true;
    };
  }, [id, days]);

  return { sessions, live, error, loading };
}

export function useTapeHistory(id: string) {
  const { chart, live, error, loading } = useChart(id, "5m", "1mo", 60_000);
  const sessions = useMemo(
    () => (chart ? sessionsFromIntraday(id, chart.bars) : []),
    [chart, id],
  );
  const dates = useMemo(() => sessions.map((s) => s.date), [sessions]);
  function barsFor(date: string): Bar[] {
    return chart ? barsOnDate(chart.bars, date, id) : [];
  }
  return { chart, sessions, dates, barsFor, live, error, loading };
}

export function useReplayTape(id: string) {
  const m5 = useChart(id, "5m", "1mo", 60_000);
  const m1 = useChart(id, "1m", "5d", 60_000);
  const sessions = useMemo(
    () => (m5.chart ? sessionsFromIntraday(id, m5.chart.bars) : []),
    [m5.chart, id],
  );
  const dates = useMemo(() => {
    if (sessions.length) return sessions.map((s) => s.date);
    return [];
  }, [sessions]);

  function barsFor(date: string, tf: number): Bar[] {
    const day1 = m1.chart ? barsOnDate(m1.chart.bars, date, id) : [];
    const day5 = m5.chart ? barsOnDate(m5.chart.bars, date, id) : [];
    if (tf <= 1 && day1.length >= 12) return day1;
    if (tf <= 5 && day1.length >= 20) return resampleBars(day1, tf);
    if (day5.length >= 8) return resampleBars(day5, Math.max(tf, 5));
    const sim = generateMinuteBars(id, date);
    return aggregateBars(sim, Math.max(1, tf));
  }

  function sessionFor(date: string): SessionDay | null {
    return sessions.find((s) => s.date === date) ?? (date ? getSession(id, date, 5) : null);
  }

  return {
    sessions,
    dates,
    barsFor,
    sessionFor,
    live: m5.live || m1.live,
    error: m5.error && !m1.live ? m5.error : null,
    loading: m5.loading && m1.loading,
  };
}

export async function evaluateLive(playbook: Playbook, days = 40): Promise<{
  evaluation: PlaybookEvaluation;
  live: boolean;
}> {
  const res = await evaluateOnFeed({ data: { playbook, days } });
  if (!res.ok) throw new Error("Evaluate failed");
  return { evaluation: res.evaluation, live: res.live };
}
