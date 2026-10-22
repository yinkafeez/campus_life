import { api } from "./client";

export function getWardrobe({ signal } = {}) {
  return api.get("/wardrobe", { signal });
}

export function getMyCharacter({ signal } = {}) {
  return api.get("/characters/me", { signal });
}

export function createCharacter(look) {
  return api.post("/characters/me", look);
}

export function updateLook(look) {
  return api.put("/characters/me/look", look);
}

// omit slots to save what the character is wearing right now
export function saveOutfit(occasion, slots) {
  return api.put(`/characters/me/outfits/${occasion}`, slots ? { slots } : {});
}

export function wearOutfit(occasion) {
  return api.post(`/characters/me/outfits/${occasion}/wear`);
}

export function savePosition(position) {
  return api.patch("/characters/me/position", position);
}
