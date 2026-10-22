import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';
import { closeTestDb, connectTestDb } from './helpers/db.js';
import { makePlayer } from './helpers/players.js';
import { importSeeds } from '../seeds/seeder.js';
import { bus, EVENTS } from '../src/core/events.js';
import {
  CampusEvent,
  CommunityGroup,
  Conversation,
  Friendship,
  Invitation,
  Message,
  Player,
  PlayerRelation,
  StudentRecord,
  User,
} from '../src/modules/models.js';

const { app, env } = buildTestApp();

beforeAll(async () => {
  await connectTestDb();
  await importSeeds();
});
afterAll(closeTestDb);
beforeEach(async () => {
  await Promise.all(
    [
      User,
      Player,
      StudentRecord,
      Friendship,
      PlayerRelation,
      CommunityGroup,
      CampusEvent,
      Invitation,
      Conversation,
      Message,
    ].map((M) => M.deleteMany({})),
  );
});

const com = (who) => ({
  get: (url) => request(app).get(`/api/v1/community${url}`).set(who.auth),
  post: (url, body) => request(app).post(`/api/v1/community${url}`).set(who.auth).send(body),
  del: (url) => request(app).delete(`/api/v1/community${url}`).set(who.auth),
});
const student = (opts) => makePlayer(env, { universitySlug: 'unilag', ...opts });
async function befriend(a, b) {
  const sent = await request(app)
    .post('/api/v1/social/friend-requests')
    .set(a.auth)
    .send({ username: b.username });
  await request(app)
    .post(`/api/v1/social/friend-requests/${sent.body.data.request._id}/accept`)
    .set(b.auth);
}
const inHours = (h) => new Date(Date.now() + h * 3600 * 1000).toISOString();

describe('groups', () => {
  it('create → others join → group chat works → owner leaving hands it over', async () => {
    const ada = await student();
    const emeka = await student();
    const created = await com(ada).post('/groups', {
      name: 'CSC 100L Study Circle',
      kind: 'study',
    });
    expect(created.status).toBe(201);
    const id = created.body.data.group.id;
    expect((await com(ada).post('/groups', { name: 'csc 100l study circle' })).status).toBe(409); // names are unique

    const joined = await com(emeka).post(`/groups/${id}/members`);
    expect(joined.body.data.group).toMatchObject({ memberCount: 2, isMember: true });

    const conversation = await Conversation.findOne({ group: id });
    expect(conversation.members).toHaveLength(2);
    // members open the group chat; outsiders can't
    const opened = await request(app)
      .post('/api/v1/messages/conversations/group')
      .set(emeka.auth)
      .send({ groupId: id });
    expect(opened.body.data.conversation.id).toBe(String(conversation._id));
    const outsider = await student();
    expect(
      (
        await request(app)
          .post('/api/v1/messages/conversations/group')
          .set(outsider.auth)
          .send({ groupId: id })
      ).status,
    ).toBe(404);
    const sent = await request(app)
      .post(`/api/v1/messages/conversations/${conversation._id}/messages`)
      .set(emeka.auth)
      .send({ text: 'Tutorial by 4pm for library?' });
    expect(sent.status).toBe(201);

    expect((await com(ada).del(`/groups/${id}/members/me`)).status).toBe(204);
    const group = await CommunityGroup.findById(id);
    expect(String(group.owner)).toBe(String(emeka.player._id));
    expect((await Conversation.findOne({ group: id })).members).toHaveLength(1);
  });

  it('invite-only groups need an invitation, and invitations are for friends only', async () => {
    const ada = await student();
    const friend = await student();
    const stranger = await student();
    const id = (
      await com(ada).post('/groups', { name: 'Jaja Boys Fellowship', visibility: 'invite' })
    ).body.data.group.id;
    expect((await com(stranger).post(`/groups/${id}/members`)).status).toBe(403);
    expect((await com(stranger).get('/groups')).body.data.groups).toHaveLength(0); // hidden from the list

    expect(
      (
        await com(ada).post('/invitations', {
          toPlayerId: String(stranger.player._id),
          groupId: id,
        })
      ).body.error.code,
    ).toBe('INVITE_NOT_ALLOWED');

    await befriend(ada, friend);
    const pushed = [];
    const listener = (e) => pushed.push(e);
    bus.on(EVENTS.INVITATION_SENT, listener);
    const invite = await com(ada).post('/invitations', {
      toPlayerId: String(friend.player._id),
      groupId: id,
    });
    bus.off(EVENTS.INVITATION_SENT, listener);
    expect(invite.status).toBe(201);
    expect(pushed[0]).toMatchObject({
      toPlayerId: String(friend.player._id),
      kind: 'group',
      title: 'Jaja Boys Fellowship',
    });
    expect(
      (await com(ada).post('/invitations', { toPlayerId: String(friend.player._id), groupId: id }))
        .status,
    ).toBe(409);

    const mine = await com(friend).get('/invitations');
    expect(mine.body.data.invitations).toHaveLength(1);
    expect(
      (await com(friend).post(`/invitations/${invite.body.data.invitation.id}/accept`)).body.data
        .invitation.status,
    ).toBe('accepted');
    expect((await CommunityGroup.findById(id)).members).toHaveLength(2);
  });

  it('cleans contact details out of public group text', async () => {
    const ada = await student();
    const res = await com(ada).post('/groups', {
      name: 'Akoka Runners',
      description: 'Join: call 08031234567',
    });
    expect(res.body.data.group.description).not.toMatch(/0803/);
  });
});

describe('events and hangouts', () => {
  it('host a hangout at a world location; others RSVP until it is full', async () => {
    const ada = await student();
    const created = await com(ada).post('/events', {
      title: 'Jollof and gist at 2001',
      locationSlug: '2001-cafeteria',
      startsAt: inHours(1),
      endsAt: inHours(3),
      capacity: 2,
    });
    expect(created.status).toBe(201);
    expect(created.body.data.event).toMatchObject({
      location: { name: expect.any(String) },
      attending: 1,
      isHost: true,
    });
    const id = created.body.data.event.id;

    const b = await student();
    const c = await student();
    expect((await com(b).post(`/events/${id}/rsvp`)).status).toBe(204);
    expect((await com(c).post(`/events/${id}/rsvp`)).body.error.code).toBe('EVENT_FULL');
    expect((await com(b).del(`/events/${id}/rsvp`)).status).toBe(204);
    expect((await com(c).post(`/events/${id}/rsvp`)).status).toBe(204);

    const list = await com(c).get('/events');
    expect(list.body.data.events[0]).toMatchObject({ isAttending: true, attending: 2 });
  });

  it('validates times and places', async () => {
    const ada = await student();
    const base = { title: 'Lagoon sunset', locationSlug: 'lagoon-front' };
    expect(
      (await com(ada).post('/events', { ...base, startsAt: inHours(-5), endsAt: inHours(-4) }))
        .status,
    ).toBe(400);
    expect(
      (await com(ada).post('/events', { ...base, startsAt: inHours(2), endsAt: inHours(1) }))
        .status,
    ).toBe(400);
    expect(
      (await com(ada).post('/events', { ...base, startsAt: inHours(1), endsAt: inHours(20) }))
        .status,
    ).toBe(400);
    expect(
      (
        await com(ada).post('/events', {
          ...base,
          locationSlug: 'faculty-of-law',
          startsAt: inHours(1),
          endsAt: inHours(2),
        })
      ).status,
    ).toBe(400);
  });

  it('friends-only events are hidden from strangers and from blocked players', async () => {
    const ada = await student();
    const friend = await student();
    const stranger = await student();
    await befriend(ada, friend);
    await com(ada).post('/events', {
      title: 'Birthday hangout',
      locationSlug: 'sofoluwe-park',
      startsAt: inHours(1),
      endsAt: inHours(2),
      visibility: 'friends',
    });
    expect((await com(friend).get('/events')).body.data.events).toHaveLength(1);
    expect((await com(stranger).get('/events')).body.data.events).toHaveLength(0);

    await request(app)
      .post('/api/v1/social/blocks')
      .set(ada.auth)
      .send({ playerId: String(friend.player._id) });
    expect((await com(friend).get('/events')).body.data.events).toHaveLength(0);
  });

  it('the host can cancel', async () => {
    const ada = await student();
    const other = await student();
    const id = (
      await com(ada).post('/events', {
        title: 'Library prep',
        locationSlug: 'university-library',
        startsAt: inHours(1),
        endsAt: inHours(2),
      })
    ).body.data.event.id;
    expect((await com(other).del(`/events/${id}`)).status).toBe(404);
    expect((await com(ada).del(`/events/${id}`)).status).toBe(204);
    expect((await com(ada).get('/events')).body.data.events).toHaveLength(0);
  });
});
