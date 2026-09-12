import { useEffect, useMemo, useRef, useState } from "react";
import { evaluateOnFeed, fetchChart, fetchQuotes, fetchSessions } from "./feed";
import { aggregateBars, generateMinuteBars, getSession } from "./generate";
import { nyToday } from "./clock";
import { barsOnDate, resampleBars, sessionsFromIntraday } from "./session";
import { isMockOn } from "../mock";
import { useOrb } from "../store";
import type { Bar, ChartFeed, FeedInterval, FeedRange, Playbook, PlaybookEvaluation, Quote, SessionDay } from "./types";

function mergeQuotes(prev: Record<string, Quote>, next: Record<string, Quote>) {
  const out = { ...prev };
  for (const [id, q] of Object.entries(next)) {
    if (q && q.last > 0) out[id] = q;
  }
  return out;
}

export function useQuotes(ids: string[], intervalMs = 12000) {
  const key = ids.join(",");
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fails = useRef(0);

  useEffect(() => {
    let stop = false;
    fails.current = 0;
    setLive(false);
    async function tick() {
      try {
        const res = await fetchQuotes({ data: { ids } });
        if (stop) return;
        if (res.ok) {
          setQuotes((prev) => mergeQuotes(prev, res.quotes));
          const any = Object.values(res.quotes).some((q) => q.last > 0);
          if (any) {
            fails.current = 0;
            setLive(true);
            setError(null);
          } else {
            fails.current += 1;
            if (fails.current >= 3) setLive(false);
            setError("Empty quotes");
          }
        } else {
          fails.current += 1;
          if (fails.current >= 3) setLive(false);
          setError(res.error);
        }
      } catch (err) {
        if (stop) return;
        fails.current += 1;
        if (fails.current >= 3) setLive(false);
        setError(err instanceof Error ? err.message : "Feed down");
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

export function useChart(id: string | null, interval: FeedInterval, range: FeedRange, intervalMs = 12000) {
  const [chart, setChart] = useState<ChartFeed | null>(null);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const fails = useRef(0);
  const had = useRef(false);

  useEffect(() => {
    let stop = false;
    fails.current = 0;
    had.current = false;
    if (!id) {
      setChart(null);
      setLive(false);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLive(false);
    setError(null);
    async function tick() {
      try {
        const res = await fetchChart({ data: { id: id!, interval, range } });
        if (stop) return;
        if (res.ok) {
          had.current = true;
          fails.current = 0;
          setChart(res.chart);
          setLive(true);
          setError(null);
        } else {
          fails.current += 1;
          if (!had.current || fails.current >= 3) setLive(false);
          setError(res.error);
        }
      } catch (err) {
        if (stop) return;
        fails.current += 1;
        if (!had.current || fails.current >= 3) setLive(false);
        setError(err instanceof Error ? err.message : "Chart down");
      } finally {
        if (!stop) setLoading(false);
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
  const [daily, setDaily] = useState<SessionDay[]>([]);
  const [available, setAvailable] = useState(0);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stop = false;
    setLoading(true);
    setLive(false);
    setError(null);
    setSessions([]);
    setDaily([]);
    setAvailable(0);
    void fetchSessions({ data: { id, days } })
      .then((res) => {
        if (stop) return;
        if (res.ok) {
          setSessions(res.sessions);
          setDaily(res.daily ?? []);
          setAvailable(res.available);
          setLive(true);
          setError(null);
        } else {
          setLive(false);
          setError(res.error);
        }
      })
      .catch((err) => {
        if (stop) return;
        setLive(false);
        setError(err instanceof Error ? err.message : "Sessions down");
      })
      .finally(() => {
        if (!stop) setLoading(false);
      });
    return () => {
      stop = true;
    };
  }, [id, days]);

  return { sessions, daily, available, live, error, loading };
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

export type TapeSource = "live" | "model" | "empty";

export function useReplayTape(id: string) {
  const recent = useChart(id, "5m", "5d", 60_000);
  const month = useChart(id, "5m", "1mo", 60_000);
  const m1 = useChart(id, "1m", "5d", 60_000);
  const mock = useOrb((s) => Boolean(s.useMockData && s.mockDay));
  const sessions = useMemo(() => {
    const dense = recent.chart ? sessionsFromIntraday(id, recent.chart.bars) : [];
    const wide = month.chart ? sessionsFromIntraday(id, month.chart.bars) : [];
    if (!wide.length) return dense;
    const seen = new Set(dense.map((s) => s.date));
    return [...dense, ...wide.filter((s) => !seen.has(s.date))];
  }, [recent.chart, month.chart, id]);
  const dates = useMemo(() => {
    const list = sessions.map((s) => s.date);
    if (list.length) return list;
    return mock ? [nyToday()] : [];
  }, [sessions, mock]);

  function sourceFor(date: string, tf: number): TapeSource {
    const day1 = m1.chart ? barsOnDate(m1.chart.bars, date, id) : [];
    const dayRecent = recent.chart ? barsOnDate(recent.chart.bars, date, id) : [];
    const dayMonth = month.chart ? barsOnDate(month.chart.bars, date, id) : [];
    const day5 = dayRecent.length >= dayMonth.length ? dayRecent : dayMonth;
    if (tf <= 1 && day1.length >= 12) return "live";
    if (tf <= 5 && day1.length >= 20) return "live";
    if (day5.length >= 8) return "live";
    const stillLoading = recent.loading || month.loading || m1.loading;
    if (stillLoading && !recent.chart && !month.chart && !m1.chart) return "empty";
    return mock ? "model" : "empty";
  }

  function nativeMinutes(date: string, tf: number): number {
    const day1 = m1.chart ? barsOnDate(m1.chart.bars, date, id) : [];
    const dayRecent = recent.chart ? barsOnDate(recent.chart.bars, date, id) : [];
    const dayMonth = month.chart ? barsOnDate(month.chart.bars, date, id) : [];
    const day5 = dayRecent.length >= dayMonth.length ? dayRecent : dayMonth;
    if (tf <= 1 && day1.length >= 12) return 1;
    if (tf <= 5 && day1.length >= 20) return tf;
    if (day5.length >= 8) return Math.max(tf, 5);
    return tf;
  }

  function barsFor(date: string, tf: number): Bar[] {
    const day1 = m1.chart ? barsOnDate(m1.chart.bars, date, id) : [];
    const dayRecent = recent.chart ? barsOnDate(recent.chart.bars, date, id) : [];
    const dayMonth = month.chart ? barsOnDate(month.chart.bars, date, id) : [];
    const day5 = dayRecent.length >= dayMonth.length ? dayRecent : dayMonth;
    if (tf <= 1 && day1.length >= 12) return day1;
    if (tf <= 5 && day1.length >= 20) return resampleBars(day1, tf);
    if (day5.length >= 8) return resampleBars(day5, Math.max(tf, 5));
    const stillLoading = recent.loading || month.loading || m1.loading;
    if (stillLoading && !recent.chart && !month.chart && !m1.chart) return [];
    if (!isMockOn()) return [];
    const sim = generateMinuteBars(id, date);
    return aggregateBars(sim, Math.max(1, tf));
  }

  function sessionFor(date: string): SessionDay | null {
    const hit = sessions.find((s) => s.date === date);
    if (hit) return hit;
    if (date && isMockOn()) return getSession(id, date, 5);
    return null;
  }

  const live = recent.live || month.live || m1.live;
  const loading = !live && (recent.loading || month.loading || m1.loading);
  const yahoo = recent.chart?.yahoo ?? month.chart?.yahoo ?? m1.chart?.yahoo ?? null;

  return {
    sessions,
    dates,
    barsFor,
    nativeMinutes,
    sessionFor,
    sourceFor,
    live,
    yahoo,
    error: recent.error && month.error && !m1.live ? recent.error : null,
    loading,
  };
}

export async function evaluateLive(playbook: Playbook, days = 40): Promise<{
  evaluation: PlaybookEvaluation;
  live: boolean;
}> {
  const res = await evaluateOnFeed({ data: { playbook, days, allowMock: isMockOn() } });
  if (!res.ok) throw new Error("Evaluate failed");
  return { evaluation: res.evaluation, live: res.live };
}
