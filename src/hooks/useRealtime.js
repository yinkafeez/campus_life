import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSocket } from "../lib/socket";
import { refreshSession } from "../api/client";
import { toast } from "../stores/useToastStore";
import { notify } from "../stores/useNotificationStore";
import {
  emotes,
  moveRemote,
  useRemotePlayers,
} from "../game/multiplayer/useRemotePlayers";
import { appendMessage } from "./useMessageQueries";
import { queryKeys } from "./queryKeys";

const MODERATION_TEXT = {
  warn: "A moderator sent you a warning about your behaviour. Please keep campus respectful.",
  "mute-chat": "A moderator has paused your chat for a while.",
  suspend: "Your account has been suspended by a moderator.",
  lifted: "A moderator lifted the restriction on your account.",
};

/**
 * The signed-in player's live connection: notifications everywhere in the game
 * (friend requests, messages, invitations, friends' activity, moderation notices).
 * Mounted once under RequireAuth. Returns the connection status.
 */
export function useRealtimeConnection() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("connecting");

  useEffect(() => {
    const socket = getSocket();
    let refreshed = false;

    const onConnect = () => {
      refreshed = false;
      setStatus("online");
    };
    const onDisconnect = () => setStatus("offline");
    // an expired access cookie fails the handshake: refresh once, then try again
    const onConnectError = async () => {
      setStatus("offline");
      if (refreshed) return;
      refreshed = true;
      if (await refreshSession()) socket.connect();
    };
    // the server cuts a socket off when its access token expires: refresh, then reconnect
    const onAuthExpired = async () => {
      if (await refreshSession()) socket.connect();
    };

    const handlers = {
      "friend:request": (e) => {
        queryClient.invalidateQueries({ queryKey: queryKeys.friends });
        notify({
          link: "/social",
          title: "Friend request",
          text: `${e.from.displayName} wants to be your friend.`,
        });
      },
      "friend:accepted": (e) => {
        queryClient.invalidateQueries({ queryKey: queryKeys.friends });
        notify({
          link: "/social",
          title: "New friend",
          text: `${e.by.displayName} accepted your friend request.`,
          tone: "success",
        });
      },
      "message:new": (e) => {
        appendMessage(queryClient, e.message);
        queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
        notify({
          title: e.from.displayName,
          text: e.message.text.slice(0, 90),
          link: `/social?tab=messages&c=${e.message.conversation ?? ""}`,
        });
      },
      "game:challenge": (e) => {
        queryClient.invalidateQueries({ queryKey: queryKeys.challenges });
        notify({
          link: "/games?tab=duels",
          title: e.matched ? "Match found" : "Duel challenge",
          text: e.matched
            ? `${e.from.displayName} joined your ${e.type} duel.`
            : `${e.from.displayName} challenged you to ${e.type}.`,
        });
      },
      "game:result": (e) => {
        queryClient.invalidateQueries({ queryKey: ["games"] });
        queryClient.invalidateQueries({ queryKey: ["economy"] });
        notify({
          link: "/games?tab=duels",
          title: "Duel finished",
          text: e.draw
            ? "It's a draw!"
            : e.won
              ? "You won the duel! 🎉"
              : "You lost this duel.",
          tone: e.won ? "success" : "info",
        });
      },
      "invitation:new": (e) => {
        queryClient.invalidateQueries({ queryKey: queryKeys.invitations });
        notify({
          link: "/social?tab=events",
          title: "Invitation",
          text: `${e.from.displayName} invited you to ${e.title}.`,
        });
      },
      "social:update": (e) => {
        if (e.type === "activity") {
          toast({
            text: `${e.displayName} — ${e.activity.label} at ${e.location.name}.`,
            ttl: 3500,
          });
        } else {
          queryClient.invalidateQueries({ queryKey: queryKeys.friends });
        }
      },
      "election:result": (e) => {
        queryClient.invalidateQueries({ queryKey: ["elections"] });
        notify({
          link: "/elections",
          title: "Election result",
          text: `You won: ${e.title}. Congratulations!`,
          tone: "success",
          ttl: 8000,
        });
      },
      "leadership:announcement": (e) => {
        queryClient.invalidateQueries({
          queryKey: ["elections", "announcements"],
        });
        notify({
          link: "/elections?tab=announcements",
          title: `${e.from.office} announcement`,
          text: e.title,
          ttl: 7000,
        });
      },
      "leadership:welfare": (e) => {
        queryClient.invalidateQueries({ queryKey: ["economy"] });
        notify({
          link: "/money",
          title: "Welfare support",
          text: `${e.office} sent you ₦${e.amount} (game money).`,
          tone: "success",
        });
      },
      "interact:greet": (e) =>
        toast({ text: `${e.from.displayName} waved at you 👋`, ttl: 3500 }),
      "moderation:notice": (e) => {
        notify({
          link: "/social?tab=safety",
          title: "Moderation",
          text:
            MODERATION_TEXT[e.action] ?? "A moderator reviewed your account.",
          tone: "warning",
          ttl: 9000,
        });
      },
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.on("auth:expired", onAuthExpired);
    Object.entries(handlers).forEach(([event, fn]) => socket.on(event, fn));
    if (!socket.connected) socket.connect();
    else onConnect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off("auth:expired", onAuthExpired);
      Object.entries(handlers).forEach(([event, fn]) => socket.off(event, fn));
      socket.disconnect();
    };
  }, [queryClient]);

  return status;
}

const SEND_EVERY_MS = 120;

/**
 * Presence in the current zone: join it, stream my position (only when it changes, with a
 * sequence number so late packets are dropped), and keep the players in view and the chat
 * in the remote-players store. The server batches everyone's movement into one
 * presence:snapshot per tick and only sends players inside my interest area.
 */
export function useZonePresence(zoneKey, stateRef) {
  const joinedZone = useRef(null);

  useEffect(() => {
    if (!zoneKey) return undefined;
    const socket = getSocket();
    const store = useRemotePlayers.getState();
    let last = null;
    let seq = 0;

    const join = async () => {
      const s = stateRef.current ?? { x: 0, z: 0, rotY: 0 };
      try {
        const ack = await socket.timeout(5000).emitWithAck("zone:join", {
          zone: zoneKey,
          x: s.x,
          z: s.z,
          rotY: s.rotY,
          seq: (seq += 1),
        });
        if (ack?.ok) {
          joinedZone.current = zoneKey;
          useRemotePlayers.getState().setAll(ack.players);
        }
      } catch {
        // no answer: the next reconnect joins again
      }
    };

    const handlers = {
      "presence:join": (p) => useRemotePlayers.getState().upsert(p),
      "presence:snapshot": (snap) => snap.players.forEach(moveRemote),
      "presence:leave": ({ playerId }) =>
        useRemotePlayers.getState().remove(playerId),
      "presence:correct": (p) => {
        if (stateRef.current)
          Object.assign(stateRef.current, { x: p.x, z: p.z });
      },
      "chat:message": (line) => useRemotePlayers.getState().addChat(line),
      "interact:emote": ({ playerId, emote }) =>
        emotes.set(playerId, { emote, at: performance.now() }),
    };
    Object.entries(handlers).forEach(([event, fn]) => socket.on(event, fn));
    socket.on("connect", join);
    if (socket.connected) join();

    const timer = setInterval(() => {
      const s = stateRef.current;
      if (!s || !socket.connected || joinedZone.current !== zoneKey) return;
      const moved =
        !last ||
        Math.hypot(s.x - last.x, s.z - last.z) > 0.05 ||
        Math.abs(s.rotY - last.rotY) > 0.05;
      if (!moved) {
        if (last && last.anim !== "idle") {
          last = { ...last, anim: "idle", seq: (seq += 1) };
          socket.volatile.emit("presence:move", last);
        }
        return;
      }
      const speed = last
        ? Math.hypot(s.x - last.x, s.z - last.z) / (SEND_EVERY_MS / 1000)
        : 0;
      last = {
        x: round(s.x),
        z: round(s.z),
        rotY: round(s.rotY),
        anim: speed > 3.2 ? "run" : "walk",
        seq: (seq += 1),
      };
      socket.volatile.emit("presence:move", last);
    }, SEND_EVERY_MS);

    return () => {
      clearInterval(timer);
      Object.entries(handlers).forEach(([event, fn]) => socket.off(event, fn));
      socket.off("connect", join);
      joinedZone.current = null;
      store.clear();
    };
  }, [zoneKey, stateRef]);
}

const newId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/**
 * Say something to the whole zone or only to players nearby. Resolves the server's answer
 * ({ ok, message } | { ok:false, error }). A message that got no answer is retried once with
 * the same id — the server never posts it twice.
 */
export async function sendZoneChat(text, { range = "zone" } = {}) {
  const payload = { text, range, clientId: newId() };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await getSocket().timeout(4000).emitWithAck("chat:send", payload);
    } catch {
      // no answer — try once more
    }
  }
  return {
    ok: false,
    error: { message: "Chat is offline. Check your connection." },
  };
}

export const EMOTES = [
  { key: "wave", label: "Wave", icon: "👋" },
  { key: "clap", label: "Clap", icon: "👏" },
  { key: "dance", label: "Dance", icon: "💃" },
  { key: "cheer", label: "Cheer", icon: "🎉" },
  { key: "laugh", label: "Laugh", icon: "😂" },
  { key: "thumbs-up", label: "Thumbs up", icon: "👍" },
];

/** Play an emote everyone around me can see. */
export async function sendEmote(emote) {
  try {
    return await getSocket()
      .timeout(3000)
      .emitWithAck("interact:emote", { emote });
  } catch {
    return { ok: false, error: { message: "You're offline." } };
  }
}

/** Greet a player standing next to me (the server checks the distance). */
export async function greetPlayer(playerId) {
  try {
    return await getSocket()
      .timeout(3000)
      .emitWithAck("interact:greet", { playerId });
  } catch {
    return { ok: false, error: { message: "You're offline." } };
  }
}

/** Tell the zone my outfit changed. */
export const refreshMyLook = () => getSocket().emit("look:refresh");

const round = (n) => Math.round(n * 100) / 100;
