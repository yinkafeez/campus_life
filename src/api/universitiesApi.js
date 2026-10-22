import { api } from "./client";

export function getUniversities({ signal } = {}) {
  return api.get("/universities", { signal });
}

export function getAdmissionOptions(slug, { signal } = {}) {
  return api.get(`/universities/${slug}/admission-options`, { signal });
}
