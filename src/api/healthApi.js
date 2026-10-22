import { api } from "./client";

export function getApiHealth({ signal } = {}) {
  return api.get("/health", { signal });
}
