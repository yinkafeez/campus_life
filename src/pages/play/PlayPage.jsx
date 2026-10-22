import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { LuMap, LuMessageCircle, LuShirt, LuSmartphone } from "react-icons/lu";
import { useMyStudent, useCompleteStep } from "../../hooks/useStudentQueries";
import { useMissions } from "../../hooks/useLearningQueries";
import { queryKeys } from "../../hooks/queryKeys";
import { currentObjective } from "../../lib/journey";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { notify } from "../../stores/useNotificationStore";
import NotificationBell from "../../components/nav/NotificationBell";
import Button from "../../components/ui/Button";
import Sheet from "../../components/ui/Sheet";
import JourneyHud from "./JourneyHud";
import OrientationBriefing from "./OrientationBriefing";
import QuickMenu from "./QuickMenu";
import {
  useMyCharacter,
  useSavePosition,
  useWardrobe,
  useWearOutfit,
} from "../../hooks/useCharacterQueries";
import { useCurrentUser } from "../../hooks/useAuthQueries";
import {
  useCampusWorld,
  useDiscoverLocation,
} from "../../hooks/useCampusQueries";
import { refreshMyLook, useZonePresence } from "../../hooks/useRealtime";
import { getErrorMessage } from "../../lib/errorMessages";
import {
  hasZone,
  loadZone,
  pickZone,
  DEFAULT_ZONE,
} from "../../game/world/zones";
import { buildZoneLayout } from "../../game/world/layout";
import {
  buildNavGrid,
  findPath,
  locationAt,
  npcNear,
} from "../../game/world/navigation";
import { useCampusStore } from "../../game/state/useCampusStore";
import { useRemotePlayers } from "../../game/multiplayer/useRemotePlayers";
import { OCCASION_LABELS } from "../../game/character/occasions";
import useKeyboardControls from "../../game/input/useKeyboardControls";
import { useInputStore } from "../../game/input/useInputStore";
import TouchJoystick from "../../game/input/TouchJoystick";
import PageLoader from "../../components/ui/PageLoader";
import Notice from "../../components/ui/Notice";
import ErrorState from "../../components/ui/ErrorState";
import { toast } from "../../stores/useToastStore";
import LocationPanel from "./LocationPanel";
import NpcDialogue from "./NpcDialogue";
import CampusMap from "./CampusMap";
import ZoneChat from "./ZoneChat";
import WayfindingHud from "./WayfindingHud";
import SocialActions from "./SocialActions";
import PerfOverlay from "../../game/perf/PerfOverlay";
import styles from "./PlayPage.module.css";

const GameWorld = lazy(() => import("../../game/GameWorld"));

const SAVE_EVERY_MS = 5000;
const NEARBY_EVERY_MS = 250;
const ROUTE_EVERY_MS = 800;
const NPC_RADIUS = 0.45;
const NO_LIST = [];
const isTouch = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(pointer: coarse)").matches;

// /play — the 3D campus. Zone + character + the university's places, NPCs and other players.
export default function PlayPage() {
  const { data: session } = useCurrentUser();
  const wardrobe = useWardrobe();
  const character = useMyCharacter();
  const campus = useCampusWorld();
  const wear = useWearOutfit();
  const savePosition = useSavePosition();
  const discover = useDiscoverLocation();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  // the fresher journey: orientation steps, then the first exploration mission
  const student = useMyStudent();
  const enrolled = ["active", "graduated"].includes(student.data?.status);
  const missions = useMissions({ enabled: enrolled });
  const completeStep = useCompleteStep();
  const objective = currentObjective({
    student: student.data,
    missions: missions.data,
  });
  const graphics = useSettingsStore((s) => s.graphics);
  const briefingSeen = useSettingsStore((s) => s.briefingSeen);
  const [menu, setMenu] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [outfitsOpen, setOutfitsOpen] = useState(false);
  const [zone, setZone] = useState(null);
  const [travelTo, setTravelTo] = useState(null);
  const [touch] = useState(isTouch);
  const run = useInputStore((s) => s.run);
  const stateRef = useRef(null);
  const lastSaved = useRef(null);
  const placedZone = useRef(null);
  const asked = useRef({ last: null }); // the place I am standing in (arrivals are recorded once)

  const {
    nearbyLocation,
    nearbyNpc,
    destination,
    route,
    panel,
    talkingTo,
    dismissedLocation,
  } = useCampusStore();
  const store = useCampusStore.getState;

  useKeyboardControls();
  useEffect(() => () => useCampusStore.getState().reset(), []);

  // WHICH ZONE: travel choice → where I left off → my university's start zone → practice plaza
  const world = campus.data?.world;
  const allowedZones = world?.zones ?? NO_LIST;
  const zoneKey =
    travelTo ??
    (campus.isPending || character.isPending
      ? null
      : pickZone({
          lastZone: character.data?.lastPosition?.zone,
          startZone: world?.startZone,
          allowed: allowedZones,
        }));
  useEffect(() => {
    if (!zoneKey) return undefined;
    let alive = true;
    loadZone(zoneKey).then((loaded) => alive && setZone(loaded));
    return () => {
      alive = false;
    };
  }, [zoneKey]);

  const locations = campus.data?.locations ?? NO_LIST;
  const zoneLocations = useMemo(
    () =>
      zone ? locations.filter((el) => el.world?.zone === zone.key) : NO_LIST,
    [locations, zone],
  );
  const zoneNpcs = useMemo(
    () =>
      zone
        ? (campus.data?.npcs ?? NO_LIST).filter((el) => el.zone === zone.key)
        : NO_LIST,
    [campus.data, zone],
  );

  // colliders (buildings, props, NPCs) + the walk grid for wayfinding
  const layout = useMemo(() => {
    if (!zone) return null;
    const base = buildZoneLayout(zone);
    base.colliders.circles.push(
      ...zoneNpcs.map((n) => ({ x: n.x, z: n.z, r: NPC_RADIUS })),
    );
    return base;
  }, [zone, zoneNpcs]);
  const navGrid = useMemo(
    () => (layout ? buildNavGrid(layout.colliders) : null),
    [layout],
  );

  // STARTING POINT per zone: my saved spot in this zone, else its spawn
  const [ready, setReady] = useState(false);
  const lastPosition = character.data?.lastPosition;
  useEffect(() => {
    if (!zone || !character.data || placedZone.current === zone.key) return;
    stateRef.current =
      lastPosition?.zone === zone.key && placedZone.current === null
        ? { x: lastPosition.x, z: lastPosition.z, rotY: lastPosition.rotY }
        : { ...zone.spawn };
    placedZone.current = zone.key;
    lastSaved.current = { ...stateRef.current };
    store().stopGuide();
    setReady(true);
  }, [zone, character.data, lastPosition, store]);

  // SAVE the position every few seconds (only if the player moved) and when leaving
  const { mutate: persist } = savePosition;
  useEffect(() => {
    if (!zone) return undefined;
    const save = () => {
      const s = stateRef.current;
      const prev = lastSaved.current;
      if (
        !s ||
        placedZone.current !== zone.key ||
        (prev && Math.hypot(s.x - prev.x, s.z - prev.z) < 0.5)
      )
        return;
      lastSaved.current = { ...s };
      persist({
        zone: zone.key,
        x: round(s.x),
        z: round(s.z),
        rotY: round(s.rotY),
      });
    };
    const timer = setInterval(save, SAVE_EVERY_MS);
    return () => {
      clearInterval(timer);
      save();
    };
  }, [zone, persist]);

  // ARRIVING somewhere can tick off an orientation step (the server checks the visit)
  // and moves mission steps along
  const { mutate: completeOnboarding } = completeStep;
  const onArrive = useCallback(
    (slug) => {
      const s = queryClient.getQueryData(queryKeys.myStudent);
      if (s?.status === "matriculated") {
        const step = s.onboarding.steps.find(
          (el) => !el.completed && el.location === slug,
        );
        if (step)
          completeOnboarding(step.key, {
            onSuccess: ({ student: updated }) => {
              notify({
                title: `Orientation ${updated.onboarding.completed}/${updated.onboarding.total}`,
                text: `✓ ${step.title}`,
                tone: "success",
                link: "/admission",
              });
              if (updated.status === "active") {
                queryClient.invalidateQueries({ queryKey: queryKeys.missions });
                setCelebrate(true);
              }
            },
          });
      }
      if (["active", "graduated"].includes(s?.status))
        queryClient.invalidateQueries({ queryKey: queryKeys.missions });
    },
    [queryClient, completeOnboarding],
  );

  // WHAT'S NEAR ME → location panel, NPC prompt, discoveries
  const { mutate: discoverPlace } = discover;
  useEffect(() => {
    if (!ready) return undefined;
    const timer = setInterval(() => {
      const s = stateRef.current;
      if (!s) return;
      const place = locationAt(zoneLocations, s);
      const npc = npcNear(zoneNpcs, s);
      store().setNearby(place?.slug ?? null, npc?.key ?? null);
      // record every arrival at a place (first time = discovery; later = a visit,
      // which is how deliveries know you walked there)
      const arrived = place && asked.current.last !== place.slug;
      asked.current.last = place?.slug ?? null;
      if (arrived) {
        discoverPlace(place.slug, {
          onSuccess: ({ isNew }) => {
            if (isNew)
              toast({
                title: "New place discovered",
                text: place.name,
                tone: "discovery",
              });
            onArrive(place.slug);
          },
          // the server checks arrivals against the position it saw; if our last moves
          // haven't reached it yet (e.g. just joined the zone), try again next tick
          onError: (err) => {
            if (err.code === "NOT_THERE" && asked.current.last === place.slug)
              asked.current.last = null;
          },
        });
      }
    }, NEARBY_EVERY_MS);
    return () => clearInterval(timer);
  }, [ready, zoneLocations, zoneNpcs, discoverPlace, store, onArrive]);

  // ?guide=<place> (from the journey screens) → start guiding once the world is ready
  const guideParam = params.get("guide");
  useEffect(() => {
    if (!ready || !guideParam) return;
    if (zoneLocations.some((el) => el.slug === guideParam))
      store().guideTo(guideParam);
    setParams(
      (p) => {
        p.delete("guide");
        return p;
      },
      { replace: true },
    );
  }, [ready, guideParam, zoneLocations, store, setParams]);

  // GUIDING: recompute the route as I walk; stop when I arrive
  const target = zoneLocations.find((el) => el.slug === destination);
  useEffect(() => {
    if (!target || !navGrid) return undefined;
    const tick = () => {
      const s = stateRef.current;
      if (!s) return;
      if (
        Math.hypot(s.x - target.world.x, s.z - target.world.z) <=
        Math.min(3, target.world.radius ?? 3)
      ) {
        store().stopGuide();
        toast({
          title: "You have arrived",
          text: target.name,
          tone: "success",
        });
        return;
      }
      const path = findPath(navGrid, s, target.world);
      store().setRoute(path);
    };
    tick();
    const timer = setInterval(tick, ROUTE_EVERY_MS);
    return () => clearInterval(timer);
  }, [target, navGrid, store]);

  // OTHER PLAYERS in this zone (presence + zone chat)
  useZonePresence(ready && zone ? zone.key : null, stateRef);
  const othersHere = useRemotePlayers((s) => Object.keys(s.players).length);
  // performance overlay: P toggles it, ?perf=1 opens with it on
  const [showPerf, setShowPerf] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("perf") === "1",
  );

  // keyboard shortcuts: M = map, E = talk / open the place, C = chat
  useEffect(() => {
    function onKey(e) {
      if (
        e.repeat ||
        (e.target instanceof HTMLElement &&
          e.target.closest("input, textarea, select"))
      )
        return;
      const s = store();
      if (e.code === "KeyM") s.openPanel("map");
      if (e.code === "KeyC") s.openPanel("chat");
      if (e.code === "KeyP") setShowPerf((v) => !v);
      if (e.code === "KeyE" && s.nearbyNpc) s.talkTo(s.nearbyNpc);
      if (e.code === "Escape") {
        s.closePanel();
        s.endTalk();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);

  if (wardrobe.isPending || character.isPending)
    return <PageLoader label="Entering campus…" />;
  const error = wardrobe.error ?? character.error;
  if (error)
    return (
      <div className={styles.failed}>
        <ErrorState
          error={error}
          title="Couldn't enter campus"
          onRetry={() => {
            wardrobe.refetch?.();
            character.refetch();
          }}
        >
          <Button to="/dashboard" size="sm" variant="ghost">
            Back to dashboard
          </Button>
        </ErrorState>
      </div>
    );
  if (!character.data) return <Navigate to="/character?next=/play" replace />;
  const placeNames = new Map(locations.map((l) => [l.slug, l.name]));

  const place = zoneLocations.find((el) => el.slug === nearbyLocation);
  const npc = zoneNpcs.find((el) => el.key === talkingTo);
  const npcHere = zoneNpcs.find((el) => el.key === nearbyNpc);
  const travelZones = [...new Set([DEFAULT_ZONE, ...allowedZones])].filter(
    hasZone,
  );
  const guidePlaces = zoneLocations.filter((el) => el.slug !== nearbyLocation);

  function travel(key) {
    if (!hasZone(key)) return;
    store().reset();
    setReady(false);
    setTravelTo(key);
  }

  return (
    <div className={styles.screen}>
      <div className={styles.world}>
        {zone && ready && layout ? (
          <Suspense fallback={<PageLoader label="Loading the world…" />}>
            <GameWorld
              zone={zone}
              layout={layout}
              character={character.data}
              catalogue={wardrobe.catalogue}
              stateRef={stateRef}
              locations={zoneLocations}
              npcs={zoneNpcs}
              destination={destination}
              route={route}
              showPerf={showPerf}
              graphics={graphics}
            />
          </Suspense>
        ) : (
          <PageLoader label="Loading the world…" />
        )}
      </div>

      {/* HUD */}
      <header className={styles.top}>
        <div className={styles.where}>
          <p className={styles.zone}>{zone?.name ?? "…"}</p>
          <p className={styles.player}>
            {session?.player?.displayName}
            {othersHere > 0 &&
              ` · ${othersHere} other${othersHere === 1 ? "" : "s"} here`}
          </p>
        </div>
        <button
          type="button"
          className={styles.iconButton}
          onClick={() => store().openPanel("map")}
          aria-label="Map and directory"
        >
          <LuMap aria-hidden="true" />
        </button>
        <button
          type="button"
          className={styles.iconButton}
          onClick={() => store().openPanel("chat")}
          aria-label="Zone chat"
        >
          <LuMessageCircle aria-hidden="true" />
        </button>
        <NotificationBell className={styles.iconButton} />
        <button
          type="button"
          className={styles.iconButton}
          onClick={() => setMenu(true)}
          aria-label="Phone: friends, messages, studies and more"
          aria-haspopup="dialog"
        >
          <LuSmartphone aria-hidden="true" />
        </button>
      </header>

      {showPerf && <PerfOverlay />}
      {ready && <SocialActions stateRef={stateRef} />}
      {ready && !destination && (
        <JourneyHud
          objective={objective}
          placeNames={placeNames}
          guiding={Boolean(destination)}
          onGuide={(slug) => store().guideTo(slug)}
        />
      )}
      {ready && !briefingSeen && (
        <OrientationBriefing
          touch={touch}
          university={campus.data?.university?.shortName}
          onDone={() => useSettingsStore.getState().set({ briefingSeen: true })}
        />
      )}
      {menu && (
        <QuickMenu
          enrolled={enrolled}
          onClose={() => setMenu(false)}
          onOpenPanel={(p) => {
            setMenu(false);
            store().openPanel(p);
          }}
        />
      )}
      {celebrate && (
        <Sheet
          title="Orientation complete!"
          onClose={() => setCelebrate(false)}
        >
          <div className={styles.celebrate}>
            <p className={styles.celebrateBig}>🎓 Welcome to campus life!</p>
            <p>
              You’re now a (game) student of{" "}
              {campus.data?.university?.shortName ?? "your university"}. Your
              studies, money, games, elections and hostel are open.
            </p>
            {objective?.stage === "mission" && (
              <p>
                Your first mission is pinned top-left:{" "}
                <strong>{objective.title}</strong>.
              </p>
            )}
            <div className={styles.celebrateActions}>
              <Button onClick={() => setCelebrate(false)}>
                Keep exploring
              </Button>
              <Button to="/dashboard" variant="secondary">
                My dashboard
              </Button>
            </div>
          </div>
        </Sheet>
      )}

      {destination && target && (
        <WayfindingHud
          name={target.name}
          route={route}
          stateRef={stateRef}
          onStop={() => store().stopGuide()}
        />
      )}

      {!destination && (
        <nav
          className={outfitsOpen ? styles.outfitsOpen : styles.outfits}
          aria-label="Change outfit"
        >
          {/* phones: one small button instead of a column over the world */}
          <button
            type="button"
            className={styles.outfitToggle}
            aria-expanded={outfitsOpen}
            onClick={() => setOutfitsOpen((v) => !v)}
          >
            <LuShirt aria-hidden="true" /> Outfit
          </button>
          {wardrobe.catalogue.occasions.map((occasion) => (
            <button
              key={occasion}
              type="button"
              className={styles.outfit}
              disabled={wear.isPending}
              onClick={() =>
                wear.mutate(occasion, {
                  onSuccess: () => {
                    refreshMyLook();
                    setOutfitsOpen(false);
                  },
                })
              }
            >
              {OCCASION_LABELS[occasion] ?? occasion}
            </button>
          ))}
        </nav>
      )}
      {wear.error && (
        <div className={styles.toast}>
          <Notice tone="danger">{getErrorMessage(wear.error)}</Notice>
        </div>
      )}
      {campus.data && !campus.data.university && zone?.key === DEFAULT_ZONE && (
        <p className={styles.banner}>
          Practice plaza. <Link to="/admission">Get admitted</Link> to walk your
          university’s campus.
        </p>
      )}

      {/* talk prompt */}
      {npcHere && !npc && (
        <button
          type="button"
          className={styles.talk}
          onClick={() => store().talkTo(npcHere.key)}
        >
          Talk to {npcHere.name} {!touch && <kbd>E</kbd>}
        </button>
      )}

      {npc && (
        <NpcDialogue
          npc={npc}
          places={guidePlaces}
          onGuide={(slug) => store().guideTo(slug)}
          onClose={() => store().endTalk()}
        />
      )}
      {place && !npc && dismissedLocation !== place.slug && panel !== "map" && (
        <LocationPanel
          location={place}
          onClose={() => store().dismissLocation(place.slug)}
        />
      )}
      {panel === "chat" && (
        <ZoneChat
          myPlayerId={session?.player?._id}
          askFor={target?.name}
          onClose={() => store().closePanel()}
        />
      )}
      {panel === "map" && zone && (
        <CampusMap
          zone={zone}
          locations={locations}
          npcs={zoneNpcs}
          stateRef={stateRef}
          destination={destination}
          travelZones={travelZones}
          onGuide={(slug) => store().guideTo(slug)}
          onTravel={(key) => travel(key)}
          onClose={() => store().closePanel()}
        />
      )}

      {touch ? (
        <>
          <div className={styles.stick}>
            <TouchJoystick />
          </div>
          <button
            type="button"
            className={run ? styles.runOn : styles.run}
            aria-pressed={run}
            onClick={() => useInputStore.getState().setRun(!run)}
          >
            Run
          </button>
        </>
      ) : (
        <p className={styles.help}>
          <kbd>W</kbd>
          <kbd>A</kbd>
          <kbd>S</kbd>
          <kbd>D</kbd> move · <kbd>Shift</kbd> run · <kbd>M</kbd> map ·{" "}
          <kbd>C</kbd> chat · drag to look
        </p>
      )}
    </div>
  );
}

const round = (n) => Math.round(n * 100) / 100;
