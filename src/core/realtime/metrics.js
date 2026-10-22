import { monitorEventLoopDelay } from 'node:perf_hooks';

/*
 * REALTIME METRICS — cheap counters for load tests and operations
 * (GET /api/v1/admin/realtime/metrics). Rates are per second over the last window.
 */
export function createMetrics() {
  const loop = monitorEventLoopDelay({ resolution: 10 });
  loop.enable();
  const state = {
    startedAt: Date.now(),
    connections: 0,
    totalConnections: 0,
    eventsIn: 0,
    dropped: 0,
    authExpired: 0,
    messagesOut: 0,
    ticks: 0,
    tickMsTotal: 0,
    tickMsMax: 0,
    windowStart: Date.now(),
  };
  return {
    connected() {
      state.connections += 1;
      state.totalConnections += 1;
    },
    disconnected() {
      state.connections -= 1;
    },
    eventIn() {
      state.eventsIn += 1;
    },
    dropped() {
      state.dropped += 1;
    },
    authExpired() {
      state.authExpired += 1;
    },
    recordTick(ms, messages) {
      state.ticks += 1;
      state.tickMsTotal += ms;
      state.tickMsMax = Math.max(state.tickMsMax, ms);
      state.messagesOut += messages;
    },
    snapshot(extra = {}) {
      const seconds = Math.max(1, (Date.now() - state.windowStart) / 1000);
      const out = {
        connections: state.connections,
        totalConnections: state.totalConnections,
        window: { seconds: Math.round(seconds) },
        eventsInPerSecond: Math.round(state.eventsIn / seconds),
        messagesOutPerSecond: Math.round(state.messagesOut / seconds),
        droppedEvents: state.dropped,
        authExpired: state.authExpired,
        tickMs: {
          avg: state.ticks ? Math.round((state.tickMsTotal / state.ticks) * 100) / 100 : 0,
          max: Math.round(state.tickMsMax * 100) / 100,
        },
        eventLoopLagMs: {
          p50: Math.round(loop.percentile(50) / 1e5) / 10,
          p99: Math.round(loop.percentile(99) / 1e5) / 10,
          max: Math.round(loop.max / 1e5) / 10,
        },
        memoryMb: Math.round(process.memoryUsage().rss / 2 ** 20),
        ...extra,
      };
      return out;
    },
    reset() {
      Object.assign(state, {
        eventsIn: 0,
        dropped: 0,
        messagesOut: 0,
        ticks: 0,
        tickMsTotal: 0,
        tickMsMax: 0,
        windowStart: Date.now(),
      });
      loop.reset();
    },
    stop() {
      loop.disable();
    },
  };
}

// the running realtime server registers itself so the admin metrics endpoint can read it
let current = null;
export const registerRealtime = (source) => {
  current = source;
};
/** The live zone hub, when realtime runs in this process (server-observed positions). */
export const realtimeHub = () => current?.hub ?? null;
export const realtimeSnapshot = ({ reset = false } = {}) => {
  if (!current) return null;
  const snap = current.metrics.snapshot(current.hub.stats());
  if (reset) current.metrics.reset();
  return snap;
};
