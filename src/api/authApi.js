import { api } from "./client";

export function register(account) {
  return api.post("/auth/register", account);
}

export function login(credentials) {
  return api.post("/auth/login", credentials);
}

export function logout() {
  return api.post("/auth/logout");
}

export function getMe({ signal } = {}) {
  return api.get("/auth/me", { signal });
}
