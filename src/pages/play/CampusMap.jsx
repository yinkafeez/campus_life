import { useEffect, useMemo, useState } from "react";
import { LuExternalLink, LuNavigation, LuX } from "react-icons/lu";
import { CATEGORY_LABELS } from "../../game/world/categories";
import styles from "./CampusMap.module.css";

const ZONE_NAMES = {
  "arrival-plaza": "Arrival Plaza (practice)",
  "unilag-senate-lagoon": "Senate & Lagoon Front",
};

/**
 * The in-game map (top-down, drawn from the zone data) and the location directory.
 * Undiscovered places show as "?" on the map until you've been there.
 */
export default function CampusMap({
  zone,
  locations,
  npcs,
  stateRef,
  destination,
  onGuide,
  onTravel,
  travelZones,
  onClose,
}) {
  const [tab, setTab] = useState("map");
  const [selected, setSelected] = useState(null);
  const [me, setMe] = useState(zone.spawn);

  // follow my position while the map is open
  useEffect(() => {
    const tick = () => stateRef.current && setMe({ ...stateRef.current });
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [stateRef]);

  const here = locations.filter((el) => el.world?.zone === zone.key);
  const picked = locations.find((el) => el.slug === selected);

  return (
    <div className={styles.overlay} role="dialog" aria-label="Campus map">
      <section className={styles.sheet}>
        <header className={styles.head}>
          <div className={styles.tabs} role="tablist">
            {["map", "directory"].map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                className={tab === key ? styles.tabOn : styles.tab}
                onClick={() => setTab(key)}
              >
                {key === "map" ? "Map" : "Directory"}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close map"
          >
            <LuX aria-hidden="true" />
          </button>
        </header>

        {tab === "map" ? (
          <>
            <ZoneMap
              zone={zone}
              places={here}
              npcs={npcs}
              me={me}
              destination={destination}
              selected={selected}
              onSelect={setSelected}
            />
            {picked ? (
              <PlaceRow
                place={picked}
                zone={zone}
                destination={destination}
                onGuide={onGuide}
                onTravel={onTravel}
              />
            ) : (
              <p className={styles.hint}>
                Tap a marker to see the place. Gold = not visited yet, green =
                visited.
              </p>
            )}
            {travelZones.length > 1 && (
              <div className={styles.travel}>
                <span>Travel:</span>
                {travelZones.map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={styles.chip}
                    disabled={key === zone.key}
                    onClick={() => onTravel(key)}
                  >
                    {ZONE_NAMES[key] ?? key}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <Directory
            locations={locations}
            zone={zone}
            destination={destination}
            onGuide={onGuide}
            onTravel={onTravel}
          />
        )}
        {zone.notToScale && (
          <p className={styles.fineprint}>
            Simplified game campus — not to scale.
          </p>
        )}
      </section>
    </div>
  );
}

function ZoneMap({ zone, places, npcs, me, destination, selected, onSelect }) {
  const { minX, maxX, minZ, maxZ } = zone.bounds;
  const pad = 4;
  const viewBox = `${minX - pad} ${minZ - pad} ${maxX - minX + pad * 2} ${maxZ - minZ + pad * 2}`;
  const arrow = (me.rotY * 180) / Math.PI;

  return (
    <svg
      className={styles.map}
      viewBox={viewBox}
      role="img"
      aria-label={`Map of ${zone.name}`}
    >
      <rect
        x={minX}
        y={minZ}
        width={maxX - minX}
        height={maxZ - minZ}
        className={styles.ground}
      />
      {zone.water && (
        <rect
          x={minX - pad}
          y={minZ - pad}
          width={maxX - minX + pad * 2}
          height={zone.water.z - minZ + pad + 1}
          className={styles.water}
        />
      )}
      {zone.paths.map((p, i) => (
        <rect
          key={i}
          x={p.x - p.width / 2}
          y={p.z - p.depth / 2}
          width={p.width}
          height={p.depth}
          className={styles.path}
        />
      ))}
      {zone.buildings.map((b) => (
        <rect
          key={b.key}
          x={b.x - b.width / 2}
          y={b.z - b.depth / 2}
          width={b.width}
          height={b.depth}
          rx={0.6}
          className={styles.building}
        />
      ))}
      {npcs.map((n) => (
        <circle key={n.key} cx={n.x} cy={n.z} r={0.9} className={styles.npc} />
      ))}
      {places.map((p) => {
        const isDest = p.slug === destination;
        return (
          <g
            key={p.slug}
            transform={`translate(${p.world.x} ${p.world.z})`}
            className={styles.pin}
            onClick={() => onSelect(p.slug)}
            role="button"
            aria-label={p.discovered || isDest ? p.name : "Undiscovered place"}
          >
            <circle
              r={selected === p.slug ? 2.6 : 2}
              className={
                isDest
                  ? styles.pinDest
                  : p.discovered
                    ? styles.pinSeen
                    : styles.pinNew
              }
            />
            <text y={0.9} className={styles.pinMark}>
              {p.discovered || isDest ? "•" : "?"}
            </text>
            {(p.discovered || isDest) && (
              <text y={-3} className={styles.pinLabel}>
                {p.name}
              </text>
            )}
          </g>
        );
      })}
      {/* me: an arrow pointing where I face (models face +Z at rotY 0) */}
      <g transform={`translate(${me.x} ${me.z}) rotate(${-arrow})`}>
        <path d="M0 2.4 L1.6 -1.6 L0 -0.6 L-1.6 -1.6 Z" className={styles.me} />
      </g>
    </svg>
  );
}

function PlaceRow({ place, zone, destination, onGuide, onTravel }) {
  const inThisZone = place.world?.zone === zone.key;
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <p className={styles.rowName}>
          {place.name}{" "}
          {!place.discovered && place.world && (
            <span className={styles.newBadge}>Not visited</span>
          )}
        </p>
        <p className={styles.rowMeta}>
          {CATEGORY_LABELS[place.category] ?? place.category}
        </p>
      </div>
      <div className={styles.rowActions}>
        {inThisZone && (
          <button
            type="button"
            className={styles.guide}
            onClick={() => onGuide(place.slug)}
            disabled={destination === place.slug}
          >
            <LuNavigation aria-hidden="true" />{" "}
            {destination === place.slug ? "Guiding" : "Guide me"}
          </button>
        )}
        {place.world && !inThisZone && (
          <button
            type="button"
            className={styles.chip}
            onClick={() => onTravel(place.world.zone)}
          >
            Travel there
          </button>
        )}
        {!place.world && (
          <span className={styles.rowMeta}>Coming to the game later</span>
        )}
        <a
          className={styles.external}
          href={place.externalMapUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${place.name} on Google Maps`}
        >
          <LuExternalLink aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

function Directory({ locations, zone, destination, onGuide, onTravel }) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const categories = useMemo(
    () => [...new Set(locations.map((el) => el.category))].sort(),
    [locations],
  );
  const term = q.trim().toLowerCase();
  const list = locations
    .filter((el) => category === "all" || el.category === category)
    .filter(
      (el) =>
        !term ||
        el.name.toLowerCase().includes(term) ||
        el.aliases?.some((a) => a.toLowerCase().includes(term)),
    )
    // places you can walk to first, then the rest of the campus
    .sort(
      (a, b) =>
        Number(Boolean(b.world)) - Number(Boolean(a.world)) ||
        a.name.localeCompare(b.name),
    );

  return (
    <div className={styles.directory}>
      <div className={styles.filters}>
        <input
          className={styles.search}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search places (e.g. library, 2001, Jaja)"
          aria-label="Search places"
        />
        <select
          className={styles.select}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Category"
        >
          <option value="all">All</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c] ?? c}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.list}>
        {list.map((place) => (
          <PlaceRow
            key={place.slug}
            place={place}
            zone={zone}
            destination={destination}
            onGuide={onGuide}
            onTravel={onTravel}
          />
        ))}
        {!list.length && <p className={styles.hint}>No place matches “{q}”.</p>}
      </div>
    </div>
  );
}
