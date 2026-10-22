import {
  LuBell,
  LuBookOpen,
  LuCalendarDays,
  LuGamepad2,
  LuHouse,
  LuLandmark,
  LuLayoutDashboard,
  LuMap,
  LuMessageSquare,
  LuPackage,
  LuSettings,
  LuShieldCheck,
  LuShirt,
  LuTarget,
  LuUser,
  LuUsers,
  LuWallet,
} from "react-icons/lu";

/*
 * Every place a player can go, in one list — the header, the phone-style bottom bar,
 * the "More" sheet and the in-world quick menu all read it, so they never disagree.
 *   enrolled: only once matriculation + orientation are done
 *   primary:  shown in the mobile bottom bar
 */
export const DESTINATIONS = [
  { key: "campus", label: "Campus", to: "/play", icon: LuMap, primary: true },
  {
    key: "dashboard",
    label: "Dashboard",
    to: "/dashboard",
    icon: LuLayoutDashboard,
    enrolled: true,
  },
  {
    key: "studies",
    label: "Studies",
    to: "/studies",
    icon: LuBookOpen,
    enrolled: true,
    primary: true,
  },
  {
    key: "missions",
    label: "Missions",
    to: "/studies?tab=missions",
    icon: LuTarget,
    enrolled: true,
    menuOnly: true,
  },
  {
    key: "social",
    label: "Friends",
    to: "/social",
    icon: LuUsers,
    primary: true,
  },
  {
    key: "messages",
    label: "Messages",
    to: "/social?tab=messages",
    icon: LuMessageSquare,
    menuOnly: true,
  },
  { key: "money", label: "Money", to: "/money", icon: LuWallet, primary: true },
  {
    key: "inventory",
    label: "Inventory",
    to: "/money?tab=inventory",
    icon: LuPackage,
    menuOnly: true,
  },
  { key: "games", label: "Games", to: "/games", icon: LuGamepad2 },
  {
    key: "competitions",
    label: "Competitions",
    to: "/games?tab=events",
    icon: LuCalendarDays,
    menuOnly: true,
  },
  {
    key: "elections",
    label: "Elections",
    to: "/elections",
    icon: LuLandmark,
    enrolled: true,
  },
  {
    key: "hostel",
    label: "Hostel",
    to: "/hostel",
    icon: LuHouse,
    enrolled: true,
  },
  { key: "wardrobe", label: "Wardrobe", to: "/character", icon: LuShirt },
  { key: "profile", label: "Profile", to: "/profile", icon: LuUser },
  {
    key: "notifications",
    label: "Notifications",
    to: "/notifications",
    icon: LuBell,
    menuOnly: true,
  },
  { key: "settings", label: "Settings", to: "/settings", icon: LuSettings },
  {
    key: "moderation",
    label: "Moderation",
    to: "/moderation",
    icon: LuShieldCheck,
    admin: true,
  },
];

/** Destinations available to this player (`journey` = still admitting / orienting). */
export function destinationsFor({ enrolled, admin = false }) {
  return DESTINATIONS.filter(
    (d) => (!d.enrolled || enrolled) && (!d.admin || admin),
  );
}
