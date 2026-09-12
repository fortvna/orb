import { nyToday } from "./market/clock";

/** Client-only flag. Server fns never generate tape unless the caller passes allowMock. */
let enabled = false;
let day: string | null = null;

export function syncMock(useMockData: boolean, mockDay: string | null) {
  enabled = useMockData;
  day = mockDay;
}

export function isMockOn(): boolean {
  return enabled && day === nyToday();
}

export function mockDay(): string | null {
  return day;
}
