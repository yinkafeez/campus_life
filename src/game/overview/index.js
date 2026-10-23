// Campus overviews (the whole-university model for the start screen and the campus map),
// one data file per university, loaded on demand. The featured one greets signed-out players.
export const OVERVIEWS = {
  unilag: () => import("./unilagOverview"),
};

export const FEATURED_CAMPUS = "unilag";

export const hasOverview = (slug) => Boolean(slug && OVERVIEWS[slug]);

export async function loadOverview(slug) {
  const loader = OVERVIEWS[slug] ?? OVERVIEWS[FEATURED_CAMPUS];
  return (await loader()).default;
}
