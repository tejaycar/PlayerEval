// === Domain Types ===

export interface Team {
  id: string;
  name: string;
  leadEmail: string;
  inviteCode: string; // shared invite code for coaches
  createdAt: string;
}

export interface Player {
  id: string;
  teamId: string;
  name: string;
  number: string;
  primaryPosition: string;
  secondaryPosition: string;
  requiredEvaluations: number;
  isNew?: boolean;
}

export interface Coach {
  id: string;
  teamId: string;
  name: string;
  email: string;
  maxPlayers: number; // max # of players this coach evaluates
  isLead: boolean;
}

export interface Evaluation {
  id: string;
  teamId: string;
  coachId: string;
  playerId: string;
  attitude: number; // 1-10
  effort: number; // 1-10
  footballIQ: number; // 1-10
  generalSkill: number; // 1-10
  positionSkill: number; // 1-10
  totalScore: number; // sum of above
  createdAt: string;
  updatedAt: string;
}

export interface Assignment {
  teamId: string;
  coachId: string;
  playerId: string;
}

// === Auth Types ===

export interface AuthToken {
  email: string;
  token: string;
  expiresAt: string;
}

export interface JWTPayload {
  coachId: string;
  teamId: string;
  email: string;
  isLead: boolean;
}

// === API Types ===

export interface PlayerUploadRow {
  name: string;
  number: string;
  primary_position: string;
  secondary_position: string;
  required_evaluations: string;
  is_new: string;
}

export interface CoachUploadRow {
  name: string;
  email: string;
  max_players: string;
}

export type RatingCategory = 'attitude' | 'effort' | 'footballIQ' | 'generalSkill' | 'positionSkill';

export const RATING_CATEGORIES: RatingCategory[] = [
  'attitude',
  'effort',
  'footballIQ',
  'generalSkill',
  'positionSkill',
];

export const RATING_LABELS: Record<RatingCategory, string> = {
  attitude: 'Attitude',
  effort: 'Effort',
  footballIQ: 'Football IQ',
  generalSkill: 'General Skill',
  positionSkill: 'Position Skill',
};
