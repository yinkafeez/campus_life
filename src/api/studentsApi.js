import { api } from "./client";

// every call acts on the signed-in player's own (simulated) student record

export function getMyStudent({ signal } = {}) {
  return api.get("/students/me", { signal });
}

export function applyForAdmission(choices) {
  return api.post("/students/me/application", choices);
}

export function respondToOffer(accept) {
  return api.post("/students/me/offer-response", { accept });
}

export function matriculate() {
  return api.post("/students/me/matriculation");
}

export function completeOnboardingStep(stepKey) {
  return api.post(`/students/me/onboarding/${stepKey}`);
}
