import { create } from "zustand";

/*
 * What the player is doing on campus right now (HUD state, not server state):
 * which place/NPC is near, where they're heading, which panel is open.
 */
export const useCampusStore = create((set) => ({
  nearbyLocation: null, // slug
  nearbyNpc: null, // npc key
  destination: null, // location slug being guided to
  route: null, // [{x, z}] waypoints
  panel: null, // null | 'map' | 'chat'
  talkingTo: null, // npc key with an open dialogue
  dismissedLocation: null, // the place whose panel was closed (until the player leaves it)

  setNearby: (nearbyLocation, nearbyNpc) =>
    set((s) =>
      s.nearbyLocation === nearbyLocation && s.nearbyNpc === nearbyNpc
        ? s
        : {
            nearbyLocation,
            nearbyNpc,
            // walking away resets "closed", and an NPC dialogue ends when you leave
            dismissedLocation:
              s.dismissedLocation === nearbyLocation
                ? s.dismissedLocation
                : null,
            talkingTo: s.talkingTo === nearbyNpc ? s.talkingTo : null,
          },
    ),
  guideTo: (slug) =>
    set({ destination: slug, route: null, panel: null, talkingTo: null }),
  setRoute: (route) => set({ route }),
  stopGuide: () => set({ destination: null, route: null }),
  openPanel: (panel) =>
    set((s) => ({ panel: s.panel === panel ? null : panel })),
  closePanel: () => set({ panel: null }),
  talkTo: (npcKey) => set({ talkingTo: npcKey, panel: null }),
  endTalk: () => set({ talkingTo: null }),
  dismissLocation: (slug) => set({ dismissedLocation: slug }),
  reset: () =>
    set({
      nearbyLocation: null,
      nearbyNpc: null,
      destination: null,
      route: null,
      panel: null,
      talkingTo: null,
      dismissedLocation: null,
    }),
}));
