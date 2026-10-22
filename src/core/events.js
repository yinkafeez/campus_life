import { EventEmitter } from 'node:events';

/*
 * In-process event bus: modules announce what happened ("friend request sent",
 * "message sent", "player did an activity") without knowing who listens.
 * The realtime layer (Socket.IO) subscribes and pushes updates to connected players.
 * Later this can be swapped for a queue / Redis pub-sub without touching the modules.
 */
export const bus = new EventEmitter();
bus.setMaxListeners(50);

export const EVENTS = {
  FRIEND_REQUEST: 'friend:request',
  FRIEND_ACCEPTED: 'friend:accepted',
  MESSAGE_SENT: 'message:sent',
  ACTIVITY_DONE: 'activity:done',
  INVITATION_SENT: 'invitation:sent',
  CHALLENGE_SENT: 'challenge:sent',
  CHALLENGE_FINISHED: 'challenge:finished',
  ELECTION_RESULT: 'election:result',
  ANNOUNCEMENT: 'leadership:announcement',
  WELFARE_GRANT: 'leadership:welfare',
  MODERATION_ACTION: 'moderation:action',
  RELATION_CHANGED: 'relation:changed',
  ACCOUNT_DELETED: 'account:deleted',
};
