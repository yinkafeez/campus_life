import { readFileSync } from 'node:fs';
import mongoose from '../src/core/db/mongoose.js';
import {
  StudentRecord,
  University,
  studentScopedModels,
  universityScopedModels,
} from '../src/modules/models.js';
import { importBundle } from '../src/modules/universities/bundle/importBundle.js';
import { importWardrobe } from '../src/modules/wardrobe/wardrobe.import.js';
import { importPack } from '../src/modules/learning/pack/importPack.js';
import { importEconomy } from '../src/modules/economy/economy.import.js';
import { importGamesPack } from '../src/modules/games/games.import.js';

const readJson = (relativePath) =>
  JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8'));

// development data = the real UNILAG catalogue bundle + a fictional second university
export const SEED_BUNDLES = [
  readJson('../data/universities/unilag.json'),
  readJson('./data/lagoon-crest.json'),
];

export const WARDROBE = readJson('../data/wardrobe/global.json');

// game learning content (activities, missions, achievements) per university
export const SEED_PACKS = [readJson('../data/learning/unilag.json')];

// the fictional economy (shop, hustles) and per-university games packs
export const ECONOMY = readJson('../data/economy/global.json');
export const GAME_PACKS = [readJson('../data/games/unilag.json')];

/** Import every seed bundle through the same importer admins use. Returns per-university results. */
export async function importSeeds(bundles = SEED_BUNDLES) {
  const summary = [];
  for (const bundle of bundles) {
    // eslint-disable-next-line no-await-in-loop -- one university at a time keeps errors readable
    const report = await importBundle(bundle);
    if (!report.valid) {
      const problems = report.errors.map((el) => `${el.path}: ${el.message}`).join('\n  ');
      throw new Error(`Seed bundle "${bundle.university?.slug}" is invalid:\n  ${problems}`);
    }
    summary.push({ slug: report.summary.university, results: report.results });
  }

  // the global wardrobe catalogue (items, palettes, default outfits)
  const wardrobe = await importWardrobe(WARDROBE);
  if (!wardrobe.valid) {
    const problems = wardrobe.errors.map((el) => `${el.path}: ${el.message}`).join('\n  ');
    throw new Error(`Wardrobe data is invalid:\n  ${problems}`);
  }
  summary.push({ slug: 'wardrobe', results: wardrobe.results });

  for (const pack of SEED_PACKS) {
    // eslint-disable-next-line no-await-in-loop -- packs need their university imported first
    const report = await importPack(pack);
    if (!report.valid) {
      const problems = report.errors.map((el) => `${el.path}: ${el.message}`).join('\n  ');
      throw new Error(`Learning pack "${pack.university}" is invalid:\n  ${problems}`);
    }
    summary.push({ slug: `learning:${pack.university}`, results: report.results });
  }

  const economy = await importEconomy(ECONOMY);
  if (!economy.valid) {
    throw new Error(
      'Economy data is invalid:\n  ' +
        economy.errors.map((el) => el.path + ': ' + el.message).join('\n  '),
    );
  }
  summary.push({ slug: 'economy', results: economy.results });

  for (const pack of GAME_PACKS) {
    // eslint-disable-next-line no-await-in-loop -- packs need their university imported first
    const report = await importGamesPack(pack);
    if (!report.valid) {
      throw new Error(
        'Games pack "' +
          pack.university +
          '" is invalid:\n  ' +
          report.errors.map((el) => el.path + ': ' + el.message).join('\n  '),
      );
    }
    summary.push({ slug: 'games:' + pack.university, results: report.results });
  }

  return summary;
}

/**
 * Delete ONLY the seeded universities and everything that belongs to them.
 * Refuses while players are enrolled there (their records would point at deleted
 * programmes) unless includePlayers is true — then their student records go too.
 */
export async function resetSeeds(bundles = SEED_BUNDLES, { includePlayers = false } = {}) {
  const slugs = bundles.map((el) => el.university.slug);
  const universities = await University.find({ slug: mongoose.trusted({ $in: slugs }) }).select(
    '_id',
  );
  const ids = universities.map((el) => el._id);
  const byUniversity = { university: mongoose.trusted({ $in: ids }) };

  const enrolled = await StudentRecord.countDocuments(byUniversity);
  if (enrolled && !includePlayers) {
    throw new Error(
      `${enrolled} player student record(s) belong to these universities. Re-run with --include-players to delete them too.`,
    );
  }

  // children first, then the tenant roots
  const deleted = {};
  for (const Model of [...(includePlayers ? studentScopedModels : []), ...universityScopedModels]) {
    // eslint-disable-next-line no-await-in-loop
    const { deletedCount } = await Model.deleteMany(byUniversity);
    deleted[Model.modelName] = deletedCount;
  }
  const { deletedCount } = await University.deleteMany({ _id: mongoose.trusted({ $in: ids }) });
  deleted.University = deletedCount;

  return deleted;
}
