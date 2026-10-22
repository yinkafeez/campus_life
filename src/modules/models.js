// registry of every model, so scripts (index sync, seeds, import) and tests can load them all.
// Add new models here as later phases create them.
import University from './universities/university.model.js';
import Faculty from './academics/faculty.model.js';
import Department from './academics/department.model.js';
import Programme from './academics/programme.model.js';
import AcademicSession from './academics/academicSession.model.js';
import CampusLocation from './campus/campusLocation.model.js';
import Hostel from './accommodation/hostel.model.js';
import LeadershipPosition from './leadership/leadershipPosition.model.js';
import User from './auth/user.model.js';
import Session from './auth/session.model.js';
import Player from './players/player.model.js';
import StudentRecord from './students/studentRecord.model.js';
import MatricSequence from './students/matricSequence.model.js';
import ItemDefinition from './wardrobe/itemDefinition.model.js';
import WardrobeSettings from './wardrobe/wardrobeSettings.model.js';
import InventoryItem from './wardrobe/inventoryItem.model.js';
import Character from './wardrobe/character.model.js';
import Npc from './campus/npc.model.js';
import Discovery from './campus/discovery.model.js';
import ActivityLog from './campus/activityLog.model.js';
import Friendship from './social/friendship.model.js';
import PlayerRelation from './social/relation.model.js';
import Conversation from './messaging/conversation.model.js';
import Message from './messaging/message.model.js';
import Report from './moderation/report.model.js';
import AccommodationAssignment from './accommodation/assignment.model.js';
import { CampusEvent, CommunityGroup, Invitation } from './community/community.models.js';
import {
  Achievement,
  ActivityAttempt,
  LearningActivity,
  LearningProgress,
  Mission,
} from './learning/learning.models.js';
import {
  EconomySettings,
  Wallet,
  LedgerEntry,
  Bill,
  ShopItem,
  Hustle,
  Job,
} from './economy/economy.models.js';
import {
  GameContent,
  GameSession,
  Challenge,
  GameStat,
  Competition,
  CompetitionEntry,
  EventSchedule,
  GameAchievement,
  GameAward,
} from './games/games.models.js';
import {
  Election,
  Candidacy,
  CampaignItem,
  CampaignSupport,
  VoteReceipt,
  Vote,
  ElectionDispute,
  LeadershipAssignment,
  LeaderAction,
  ElectionAudit,
} from './elections/elections.models.js';

export {
  University,
  Faculty,
  Department,
  Programme,
  AcademicSession,
  CampusLocation,
  Hostel,
  LeadershipPosition,
  User,
  Session,
  Player,
  StudentRecord,
  MatricSequence,
  ItemDefinition,
  WardrobeSettings,
  InventoryItem,
  Character,
  Npc,
  Discovery,
  ActivityLog,
  Friendship,
  PlayerRelation,
  Conversation,
  Message,
  Report,
  AccommodationAssignment,
  CommunityGroup,
  CampusEvent,
  Invitation,
  LearningActivity,
  Mission,
  Achievement,
  ActivityAttempt,
  LearningProgress,
  EconomySettings,
  Wallet,
  LedgerEntry,
  Bill,
  ShopItem,
  Hustle,
  Job,
  GameContent,
  GameSession,
  Challenge,
  GameStat,
  Competition,
  CompetitionEntry,
  EventSchedule,
  GameAchievement,
  GameAward,
  Election,
  Candidacy,
  CampaignItem,
  CampaignSupport,
  VoteReceipt,
  Vote,
  ElectionDispute,
  LeadershipAssignment,
  LeaderAction,
  ElectionAudit,
};

export const allModels = [
  University,
  Faculty,
  Department,
  Programme,
  AcademicSession,
  CampusLocation,
  Hostel,
  LeadershipPosition,
  User,
  Session,
  Player,
  StudentRecord,
  MatricSequence,
  ItemDefinition,
  WardrobeSettings,
  InventoryItem,
  Character,
  Npc,
  Discovery,
  ActivityLog,
  Friendship,
  PlayerRelation,
  Conversation,
  Message,
  Report,
  AccommodationAssignment,
  CommunityGroup,
  CampusEvent,
  Invitation,
  LearningActivity,
  Mission,
  Achievement,
  ActivityAttempt,
  LearningProgress,
  EconomySettings,
  Wallet,
  LedgerEntry,
  Bill,
  ShopItem,
  Hustle,
  Job,
  GameContent,
  GameSession,
  Challenge,
  GameStat,
  Competition,
  CompetitionEntry,
  EventSchedule,
  GameAchievement,
  GameAward,
  Election,
  Candidacy,
  CampaignItem,
  CampaignSupport,
  VoteReceipt,
  Vote,
  ElectionDispute,
  LeadershipAssignment,
  LeaderAction,
  ElectionAudit,
];

// catalogue models that belong to one university — deleted together when seed data is reset.
// (Player data — StudentRecord, MatricSequence — is NOT here: resetting a catalogue never
// deletes players' progress; studentScopedModels lists it for explicit admin tools.)
export const universityScopedModels = [
  Programme,
  Department,
  Faculty,
  AcademicSession,
  Hostel,
  LeadershipPosition,
  CampusLocation,
  Npc,
  LearningActivity,
  Mission,
  Achievement,
  GameContent,
  EventSchedule,
  GameAchievement,
];

export const studentScopedModels = [StudentRecord, MatricSequence];
