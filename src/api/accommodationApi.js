import { api } from "./client";

// simulated hostel life — /api/v1/accommodation
export const getHostels = ({ signal } = {}) =>
  api.get("/accommodation/hostels", { signal });
export const getMyAccommodation = ({ signal } = {}) =>
  api.get("/accommodation/me", { signal });
export const requestBed = (hostelSlug) =>
  api.post("/accommodation/me", { hostelSlug });
export const vacateBed = () => api.delete("/accommodation/me");
