import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';
import { closeTestDb, connectTestDb } from './helpers/db.js';
import { importSeeds, WARDROBE } from '../seeds/seeder.js';
import { validateWardrobe } from '../src/modules/wardrobe/wardrobe.import.js';
import {
  Character,
  InventoryItem,
  ItemDefinition,
  Player,
  Session,
  User,
} from '../src/modules/models.js';

const { app } = buildTestApp({ AUTH_RATE_LIMIT_MAX: '1000' });

beforeAll(async () => {
  await connectTestDb();
  await importSeeds(); // includes the global wardrobe
});
afterAll(closeTestDb);
beforeEach(async () => {
  await Promise.all([User, Player, Session, Character, InventoryItem].map((M) => M.deleteMany({})));
});

let n = 0;
async function signedIn() {
  n += 1;
  const agent = request.agent(app);
  await agent.post('/api/v1/auth/register').send({
    email: `look${n}@example.test`,
    username: `look_${n}`,
    password: 'Wardrobe-2026x',
    displayName: `Stylist ${n}`,
    confirmAge: true,
  });
  return { agent, username: `look_${n}` };
}

const LOOK = {
  appearance: {
    bodyType: 'average',
    height: 1,
    skinTone: 'tone-3',
    hairColor: 'black',
    hairStyle: 'hair-afro',
  },
  equipped: {
    top: { item: 'tshirt', color: '#0e9356' },
    bottom: { item: 'jeans', color: '#1e3a5f' },
    shoes: { item: 'sneakers', color: '#f4f1ea' },
  },
};

describe('wardrobe data', () => {
  it('the shipped wardrobe file is valid', () => {
    const report = validateWardrobe(WARDROBE);
    expect(report.errors).toEqual([]);
  });

  it('rejects duplicates, non-starter outfit items and full-body + top clashes', () => {
    const broken = structuredClone(WARDROBE);
    broken.items.push({ ...broken.items[0] });
    broken.settings.defaultOutfits.formal = {
      fullbody: { item: 'agbada' },
      top: { item: 'tshirt' },
    };
    const paths = validateWardrobe(broken).errors.map((el) => el.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        `items.${broken.items.length - 1}.key`,
        'settings.defaultOutfits.formal.fullbody.item', // agbada is not a starter item
        'settings.defaultOutfits.formal.fullbody', // fullbody + top
      ]),
    );
  });

  it('is imported idempotently', async () => {
    const before = await ItemDefinition.countDocuments();
    await importSeeds();
    expect(await ItemDefinition.countDocuments()).toBe(before);
  });
});

describe('character creation', () => {
  it('serves the catalogue and palettes', async () => {
    const { agent } = await signedIn();
    const res = await agent.get('/api/v1/wardrobe');
    expect(res.status).toBe(200);
    expect(res.body.data.palettes.skinTones.length).toBeGreaterThan(0);
    expect(res.body.data.occasions).toEqual([
      'lecture',
      'matriculation',
      'party',
      'formal',
      'sports',
    ]);
    expect(res.body.data.owned).toEqual([]);
    expect(res.body.data.items.find((el) => el.key === 'gele')).toMatchObject({ slot: 'headwear' });
  });

  it('creates the character with the starter kit and five default outfits', async () => {
    const { agent } = await signedIn();
    expect((await agent.get('/api/v1/characters/me')).body.error.code).toBe('NO_CHARACTER');

    const res = await agent.post('/api/v1/characters/me').send(LOOK);
    expect(res.status).toBe(201);
    const { character } = res.body.data;
    expect(character.appearance.hairStyle).toBe('hair-afro');
    expect(character.outfits.map((el) => el.occasion).sort()).toEqual([
      'formal',
      'lecture',
      'matriculation',
      'party',
      'sports',
    ]);

    const starters = await ItemDefinition.countDocuments({ isStarter: true });
    const wardrobe = await agent.get('/api/v1/wardrobe');
    expect(wardrobe.body.data.owned).toHaveLength(starters);
    expect(wardrobe.body.data.owned.map((el) => el.itemKey)).not.toContain('agbada');

    expect((await agent.post('/api/v1/characters/me').send(LOOK)).status).toBe(409);
  });

  it('only allows owned items, matching slots and palette colours', async () => {
    const { agent } = await signedIn();
    const res = await agent.post('/api/v1/characters/me').send({
      appearance: { ...LOOK.appearance, skinTone: 'green', hairStyle: 'tshirt' },
      equipped: {
        fullbody: { item: 'agbada' }, // not owned (not a starter item)
        shoes: { item: 'tshirt' }, // wrong slot
        top: { item: 'polo-shirt', color: '#123456' }, // not a palette colour
      },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((el) => el.path)).toEqual(
      expect.arrayContaining([
        'appearance.skinTone',
        'appearance.hairStyle',
        'equipped.fullbody.item',
        'equipped.shoes.item',
        'equipped.top.color',
        'equipped.fullbody', // fullbody + top clash
      ]),
    );
    expect(
      res.body.error.details.find((el) => el.path === 'equipped.fullbody.item').message,
    ).toMatch(/don't own/);
    expect(await Character.countDocuments()).toBe(0);
  });

  it('rejects out-of-range body values and unknown slots at the schema level', async () => {
    const { agent } = await signedIn();
    const res = await agent.post('/api/v1/characters/me').send({
      appearance: { ...LOOK.appearance, height: 3, bodyType: 'giant' },
      equipped: { cape: { item: 'tshirt' } },
    });
    expect(res.status).toBe(400);
  });
});

describe('ACCEPTANCE — customise, change outfits, move, and keep the look', () => {
  it('saves the look, outfits and position across sign-out / sign-in', async () => {
    const { agent, username } = await signedIn();
    await agent.post('/api/v1/characters/me').send(LOOK);

    // customise
    const restyled = await agent.put('/api/v1/characters/me/look').send({
      appearance: {
        bodyType: 'slim',
        height: 1.05,
        skinTone: 'tone-6',
        hairColor: 'burgundy',
        hairStyle: 'hair-braids',
      },
      equipped: {
        fullbody: { item: 'ankara-gown', color: '#7c3aed' },
        shoes: { item: 'sandals', color: '#8b5e34' },
        headwear: { item: 'gele', color: '#f5b70a' },
      },
    });
    expect(restyled.status).toBe(200);

    // save it as the party outfit, then change into the sports outfit
    const saved = await agent.put('/api/v1/characters/me/outfits/party').send({});
    expect(
      saved.body.data.character.outfits.find((el) => el.occasion === 'party').slots,
    ).toMatchObject({
      fullbody: { item: 'ankara-gown' },
      headwear: { item: 'gele' },
    });
    const sporty = await agent.post('/api/v1/characters/me/outfits/sports/wear');
    expect(sporty.body.data.character.equipped).toMatchObject({
      top: { item: 'sports-jersey' },
      bottom: { item: 'shorts' },
    });

    // ...and back into the party outfit
    await agent.post('/api/v1/characters/me/outfits/party/wear');

    // walked somewhere in the world
    const moved = await agent
      .patch('/api/v1/characters/me/position')
      .send({ zone: 'arrival-plaza', x: 12.5, z: -4, rotY: 1.2 });
    expect(moved.status).toBe(200);

    // sign out, sign back in → same character
    await agent.post('/api/v1/auth/logout');
    await agent
      .post('/api/v1/auth/login')
      .send({ identifier: username, password: 'Wardrobe-2026x' });
    const { character } = (await agent.get('/api/v1/characters/me')).body.data;
    expect(character.appearance).toMatchObject({
      hairStyle: 'hair-braids',
      hairColor: 'burgundy',
      bodyType: 'slim',
    });
    expect(character.equipped).toMatchObject({
      fullbody: { item: 'ankara-gown', color: '#7c3aed' },
      headwear: { item: 'gele' },
    });
    expect(character.lastPosition).toMatchObject({ zone: 'arrival-plaza', x: 12.5, z: -4 });
  });

  it('refuses to wear an outfit containing an item the player no longer owns', async () => {
    const { agent } = await signedIn();
    await agent.post('/api/v1/characters/me').send(LOOK);
    const player = await Player.findOne();
    await InventoryItem.deleteOne({ player: player._id, itemKey: 'senator-suit' });

    const res = await agent.post('/api/v1/characters/me/outfits/formal/wear');
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].message).toMatch(/don't own "senator-suit"/);
  });

  it('validates positions', async () => {
    const { agent } = await signedIn();
    await agent.post('/api/v1/characters/me').send(LOOK);
    const res = await agent
      .patch('/api/v1/characters/me/position')
      .send({ zone: 'Arrival Plaza!', x: 'far', z: 0, rotY: 0 });
    expect(res.status).toBe(400);
  });
});
