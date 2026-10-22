import { api } from "./client";

// a fresh id per user action, so a retried request is never charged twice
export const newRequestKey = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;

// fictional Campus Coins — /api/v1/economy
export const getWallet = ({ signal } = {}) =>
  api.get("/economy/wallet", { signal });
export const claimAllowance = () => api.post("/economy/wallet/allowance");
export const getTransactions = ({ before, signal } = {}) =>
  api.get(`/economy/wallet/transactions${before ? `?before=${before}` : ""}`, {
    signal,
  });
export const getBudget = ({ signal } = {}) =>
  api.get("/economy/wallet/budget", { signal });
export const setPlan = (plan) => api.patch("/economy/wallet/plan", plan);
export const moveSavings = (direction, amount) =>
  api.post("/economy/wallet/savings", {
    direction,
    amount,
    requestKey: newRequestKey(),
  });

export const getBills = ({ signal } = {}) =>
  api.get("/economy/bills", { signal });
export const payBill = (id) => api.post(`/economy/bills/${id}/pay`);

export const getShop = ({ signal } = {}) =>
  api.get("/economy/shop", { signal });
export const buyItem = (itemKey, quantity, requestKey) =>
  api.post("/economy/purchases", { itemKey, quantity, requestKey });
export const getInventory = ({ signal } = {}) =>
  api.get("/economy/inventory", { signal });
export const consumeItem = (itemKey) =>
  api.post(`/economy/inventory/${itemKey}/use`);
export const giftItem = (gift) => api.post("/economy/gifts", gift);

export const getHustles = ({ signal } = {}) =>
  api.get("/economy/hustles", { signal });
export const acceptJob = (hustleKey) =>
  api.post(`/economy/hustles/${hustleKey}/jobs`);
export const getJob = (id, { signal } = {}) =>
  api.get(`/economy/jobs/${id}`, { signal });
export const completeJob = (id, answer) =>
  api.post(`/economy/jobs/${id}/complete`, answer ? { answer } : {});
export const abandonJob = (id) => api.delete(`/economy/jobs/${id}`);
export const getRecentJobs = ({ signal } = {}) =>
  api.get("/economy/jobs", { signal });
