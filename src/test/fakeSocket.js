// A stand-in for the Socket.IO client: tests can push server events with `fakeSocket.serverEmit`
// and answer acks via `fakeSocket.acks[event] = (payload) => reply`.
const listeners = new Map();

export const fakeSocket = {
  connected: false,
  emitted: [],
  acks: {},
  on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return this;
  },
  off(event, fn) {
    listeners.get(event)?.delete(fn);
    return this;
  },
  connect() {
    this.connected = true;
    this.serverEmit("connect");
    return this;
  },
  disconnect() {
    this.connected = false;
    return this;
  },
  emit(event, payload) {
    this.emitted.push([event, payload]);
    return this;
  },
  timeout() {
    return this;
  },
  async emitWithAck(event, payload) {
    this.emitted.push([event, payload]);
    const reply = this.acks[event];
    return typeof reply === "function"
      ? reply(payload)
      : (reply ?? { ok: true });
  },
  get volatile() {
    return this;
  },
  serverEmit(event, data) {
    listeners.get(event)?.forEach((fn) => fn(data));
  },
  reset() {
    listeners.clear();
    this.connected = false;
    this.emitted = [];
    this.acks = {};
  },
};

export const socketModule = {
  getSocket: () => fakeSocket,
  closeSocket: () => fakeSocket.disconnect(),
};
