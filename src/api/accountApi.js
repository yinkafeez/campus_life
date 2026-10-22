import { api } from "./client";

// the signed-in player's account & data rights — /api/v1/account
export const changePassword = (currentPassword, newPassword) =>
  api.patch("/account/password", { currentPassword, newPassword });
export const exportMyData = () => api.get("/account/export");
export const deleteMyAccount = (password, confirm) =>
  api.delete("/account", { password, confirm });

// moderators (admin accounts) — /api/v1/admin
export const getReports = (status = "open", { signal } = {}) =>
  api.get(`/admin/reports?status=${status}`, { signal });
export const resolveReport = (id, decision) =>
  api.patch(`/admin/reports/${id}`, decision);
export const getModerationHistory = (playerId, { signal } = {}) =>
  api.get(`/admin/players/${playerId}/moderation`, { signal });
export const liftSanctions = (playerId, note) =>
  api.post(`/admin/players/${playerId}/sanctions/lift`, { note });

// crash reports (anonymous, no personal data)
export const reportClientError = (report) => api.post("/client-errors", report);
