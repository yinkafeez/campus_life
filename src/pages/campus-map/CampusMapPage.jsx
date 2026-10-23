import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LuArrowLeft, LuMapPin } from "react-icons/lu";
import { useCampusWorld } from "../../hooks/useCampusQueries";
import { useMyStudent } from "../../hooks/useStudentQueries";
import {
  FEATURED_CAMPUS,
  hasOverview,
  loadOverview,
} from "../../game/overview";
import Button from "../../components/ui/Button";
import PageLoader from "../../components/ui/PageLoader";
import styles from "./CampusMapPage.module.css";

const CampusOverview = lazy(() => import("../../game/overview/CampusOverview"));

/*
 * "/welcome" (first time, after creating an account) and "/campus-map" (any time):
 * the whole university from above, a signpost naming every location. Tap a sign to read
 * about the place. New players then start their journey at the Main Gate.
 */
export default function CampusMapPage({ intro = false }) {
  const navigate = useNavigate();
  const campus = useCampusWorld();
  const student = useMyStudent();
  const slug =
    campus.data?.university?.slug ??
    student.data?.university?.slug ??
    FEATURED_CAMPUS;
  const [data, setData] = useState(null);
  const [picked, setPicked] = useState(null);

  useEffect(() => {
    let alive = true;
    loadOverview(hasOverview(slug) ? slug : FEATURED_CAMPUS).then(
      (d) => alive && setData(d),
    );
    return () => {
      alive = false;
    };
  }, [slug]);

  // real names / descriptions from the university's records when we have them
  const records = useMemo(
    () => new Map((campus.data?.locations ?? []).map((l) => [l.slug, l])),
    [campus.data],
  );
  const names = useMemo(
    () => new Map([...records].map(([s, l]) => [s, l.name])),
    [records],
  );
  const place = picked && data?.places.find((p) => p.slug === picked);
  const record = picked && records.get(picked);

  const status = student.data?.status;
  const enrolled = ["matriculated", "active", "graduated"].includes(status);
  const start = enrolled ? "/play" : "/admission";

  return (
    <div className={styles.screen}>
      <div className={styles.map}>
        {data ? (
          <Suspense fallback={<PageLoader label="Drawing the campus…" />}>
            <CampusOverview
              data={data}
              mode="map"
              names={names}
              highlight={picked}
              onPick={setPicked}
            />
          </Suspense>
        ) : (
          <PageLoader label="Drawing the campus…" />
        )}
      </div>

      <header className={styles.top}>
        {!intro && (
          <Link
            to="/play"
            className={styles.back}
            aria-label="Back to the game"
          >
            <LuArrowLeft aria-hidden="true" />
          </Link>
        )}
        <div className={styles.titleBox}>
          <p className={styles.eyebrow}>{intro ? "Welcome" : "Campus map"}</p>
          <h1 className={styles.title}>{data?.name ?? "Your campus"}</h1>
          <p className={styles.hint}>
            Drag to move · pinch or scroll to zoom · tap a signpost. Stylised
            and not to scale.
          </p>
        </div>
      </header>

      <aside className={styles.card} aria-live="polite">
        {place ? (
          <>
            <p className={styles.kicker}>
              <LuMapPin aria-hidden="true" />{" "}
              {record?.category ??
                place.category ??
                (place.kind === "hall" ? "hall of residence" : "place")}
            </p>
            <h2 className={styles.place}>{record?.name ?? place.label}</h2>
            {record?.description && (
              <p className={styles.text}>{record.description}</p>
            )}
            {record?.externalMapUrl && (
              <a
                className={styles.link}
                href={record.externalMapUrl}
                target="_blank"
                rel="noreferrer"
              >
                See the real place on Google Maps
              </a>
            )}
          </>
        ) : (
          <>
            <h2 className={styles.place}>
              {intro ? "This is your campus" : "Find your way"}
            </h2>
            <p className={styles.text}>
              {intro
                ? "Every signpost names a real place on campus: halls, faculties, food spots and landmarks. Your journey starts at the Main Gate (bottom left), where the cabs drop you off."
                : "Tap any signpost to see what's there."}
            </p>
          </>
        )}
        {intro && (
          <div className={styles.actions}>
            <Button size="lg" onClick={() => navigate(start)}>
              {enrolled ? "Start at the Main Gate" : "Apply for admission"}
            </Button>
            {!enrolled && (
              <p className={styles.fine}>
                First get your (simulated) admission. Then your journey starts
                at the Main Gate.
              </p>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
