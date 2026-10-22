import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import PageLoader from "./components/ui/PageLoader";
import GameShell from "./layouts/GameShell";
import StartLayout from "./layouts/StartLayout";
import GameLayout from "./layouts/GameLayout";
import GameEntry from "./components/routing/GameEntry";
import GuestOnly from "./components/routing/GuestOnly";
import RequireAuth from "./components/routing/RequireAuth";

// screens load on demand
const LoginPage = lazy(() => import("./pages/start/LoginPage"));
const RegisterPage = lazy(() => import("./pages/start/RegisterPage"));
const AdmissionPage = lazy(() => import("./pages/admission/AdmissionPage"));
const DashboardPage = lazy(() => import("./pages/dashboard/DashboardPage"));
const ProfilePage = lazy(() => import("./pages/profile/ProfilePage"));
const StatusPage = lazy(() => import("./pages/status/StatusPage"));
const NotFoundPage = lazy(() => import("./pages/not-found/NotFoundPage"));
const CharacterPage = lazy(() => import("./pages/character/CharacterPage"));
const PlayPage = lazy(() => import("./pages/play/PlayPage"));
const SocialPage = lazy(() => import("./pages/social/SocialPage"));
const PlayerProfilePage = lazy(
  () => import("./pages/players/PlayerProfilePage"),
);
const HostelPage = lazy(() => import("./pages/hostel/HostelPage"));
const StudiesPage = lazy(() => import("./pages/studies/StudiesPage"));
const ActivityPage = lazy(() => import("./pages/studies/ActivityPage"));
const MoneyPage = lazy(() => import("./pages/money/MoneyPage"));
const JobPage = lazy(() => import("./pages/money/JobPage"));
const GamesPage = lazy(() => import("./pages/games/GamesPage"));
const GameSessionPage = lazy(() => import("./pages/games/GameSessionPage"));
const ElectionsPage = lazy(() => import("./pages/elections/ElectionsPage"));
const ElectionPage = lazy(() => import("./pages/elections/ElectionPage"));
const SettingsPage = lazy(() => import("./pages/settings/SettingsPage"));
const ModerationPage = lazy(() => import("./pages/moderation/ModerationPage"));
const PrivacyPage = lazy(() => import("./pages/privacy/PrivacyPage"));
const NotificationsPage = lazy(
  () => import("./pages/settings/NotificationsPage"),
);

export default function App() {
  return (
    <Routes>
      {/* everything sits on the 3D campus scene */}
      <Route element={<GameShell />}>
        {/* "/" resumes the player where they left off */}
        <Route index element={<GameEntry />} />

        {/* START SCREEN — signed-out players only */}
        <Route element={<GuestOnly />}>
          <Route element={<StartLayout />}>
            <Route path="login" element={<LoginPage />} />
            <Route path="register" element={<RegisterPage />} />
          </Route>
        </Route>
        <Route element={<StartLayout />}>
          <Route path="status" element={<StatusPage />} />
          <Route path="privacy" element={<PrivacyPage />} />
        </Route>

        {/* IN GAME — signed-in players */}
        <Route element={<RequireAuth />}>
          <Route element={<GameLayout />}>
            <Route path="admission" element={<AdmissionPage />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="social" element={<SocialPage />} />
            <Route path="players/:username" element={<PlayerProfilePage />} />
            <Route path="hostel" element={<HostelPage />} />
            <Route path="studies" element={<StudiesPage />} />
            <Route path="studies/activities/:key" element={<ActivityPage />} />
            <Route path="money" element={<MoneyPage />} />
            <Route path="money/jobs/:id" element={<JobPage />} />
            <Route path="games" element={<GamesPage />} />
            <Route path="games/play/:id" element={<GameSessionPage />} />
            <Route path="elections" element={<ElectionsPage />} />
            <Route path="elections/:id" element={<ElectionPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="moderation" element={<ModerationPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>

      {/* FULL-SCREEN 3D — own canvas, so outside the backdrop shell (one WebGL scene at a time) */}
      <Route element={<RequireAuth />}>
        <Route
          path="character"
          element={
            <Suspense fallback={<PageLoader />}>
              <CharacterPage />
            </Suspense>
          }
        />
        <Route
          path="play"
          element={
            <Suspense fallback={<PageLoader />}>
              <PlayPage />
            </Suspense>
          }
        />
      </Route>
    </Routes>
  );
}
