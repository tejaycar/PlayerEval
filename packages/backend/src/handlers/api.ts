import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { putItem, getItem, queryItems, deleteItem, batchPutItems, updateItem } from '../db';
import { authenticateRequest, sendMagicLink, verifyMagicToken, issueJWT } from '../auth';
import { computeAssignments } from '../assignment';
import type { Player, Coach, Evaluation, JWTPayload } from '@player-eval/shared';

type Event = APIGatewayProxyEventV2;
type Result = APIGatewayProxyResultV2;

function json(statusCode: number, body: any): Result {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Test-User',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

function parseBody(event: Event): any {
  if (!event.body) return {};
  try {
    return JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body);
  } catch {
    return {};
  }
}

export async function handler(event: Event): Promise<Result> {
  // Handle CORS preflight
  if (event.requestContext.http.method === 'OPTIONS') {
    return json(200, {});
  }

  const method = event.requestContext.http.method;
  const path = event.rawPath.replace(/^\/api/, '');

  // === Public routes (no auth required) ===

  // POST /auth/request - Request magic link
  if (method === 'POST' && path === '/auth/request') {
    const { email, teamId } = parseBody(event);
    if (!email) return json(400, { error: 'Email required' });

    // Find coach by email in the team
    const coaches = await queryItems(`TEAM#${teamId}`, 'COACH#');
    const coach = coaches.find((c) => c.email === email);
    if (!coach) return json(404, { error: 'Coach not found with this email' });

    const token = await sendMagicLink(email, teamId);
    return json(200, { message: 'Magic link sent', token: process.env.BYPASS_AUTH === 'true' ? token : undefined });
  }

  // GET /auth/verify?token=xxx - Verify magic link token
  if (method === 'GET' && path === '/auth/verify') {
    const token = event.queryStringParameters?.token;
    if (!token) return json(400, { error: 'Token required' });

    const email = await verifyMagicToken(token);
    if (!email) return json(401, { error: 'Invalid or expired token' });

    // Find the coach across all teams (look up by GSI)
    // For simplicity, we stored teamId in the auth token
    const authItem = await getItem(`AUTH#${token}`, 'TOKEN');
    if (!authItem) return json(401, { error: 'Token not found' });

    const teamId = authItem.teamId;
    const coaches = await queryItems(`TEAM#${teamId}`, 'COACH#');
    const coach = coaches.find((c) => c.email === email);
    if (!coach) return json(404, { error: 'Coach not found' });

    const jwtPayload: JWTPayload = {
      coachId: coach.id,
      teamId,
      email,
      isLead: coach.isLead || false,
    };

    const jwt = issueJWT(jwtPayload);
    return json(200, { token: jwt, coach: { id: coach.id, name: coach.name, isLead: coach.isLead, teamId } });
  }

  // POST /auth/signup - Coach signup via invite link
  if (method === 'POST' && path === '/auth/signup') {
    const { email, inviteCode } = parseBody(event);
    if (!email || !inviteCode) return json(400, { error: 'Email and invite code required' });

    // Find team by invite code (scan - ok for small dataset)
    // In production we'd use a GSI, but for now query all teams
    // Actually let's store invite codes with a known PK
    const inviteItem = await getItem(`INVITE#${inviteCode}`, 'META');
    if (!inviteItem) return json(404, { error: 'Invalid invite code' });

    const teamId = inviteItem.teamId;
    const coaches = await queryItems(`TEAM#${teamId}`, 'COACH#');
    const coach = coaches.find((c) => c.email === email);
    if (!coach) return json(404, { error: 'Coach email not found. Ask your lead to add you first.' });

    const token = await sendMagicLink(email, teamId);
    return json(200, { message: 'Magic link sent', token: process.env.BYPASS_AUTH === 'true' ? token : undefined });
  }

  // === Protected routes ===
  const headers: Record<string, string | undefined> = {};
  if (event.headers) {
    Object.entries(event.headers).forEach(([k, v]) => {
      headers[k.toLowerCase()] = v;
    });
  }

  const user = authenticateRequest(headers);
  if (!user) return json(401, { error: 'Unauthorized' });

  const { teamId, coachId, isLead } = user;

  // === Team routes ===

  // GET /team
  if (method === 'GET' && path === '/team') {
    const teamMeta = await getItem(`TEAM#${teamId}`, 'META');
    return json(200, { team: teamMeta });
  }

  // POST /team - Create team (first time setup)
  if (method === 'POST' && path === '/team') {
    const { name } = parseBody(event);
    const inviteCode = uuidv4().slice(0, 8);

    await putItem({
      PK: `TEAM#${teamId}`,
      SK: 'META',
      id: teamId,
      name,
      leadEmail: user.email,
      inviteCode,
      createdAt: new Date().toISOString(),
    });

    // Store invite code lookup
    await putItem({
      PK: `INVITE#${inviteCode}`,
      SK: 'META',
      teamId,
    });

    return json(201, { teamId, inviteCode });
  }

  // === Player routes ===

  // GET /players
  if (method === 'GET' && path === '/players') {
    const items = await queryItems(`TEAM#${teamId}`, 'PLAYER#');
    const players = items.map((item) => ({
      id: item.id,
      name: item.name,
      number: item.number,
      primaryPosition: item.primaryPosition,
      secondaryPosition: item.secondaryPosition,
      requiredEvaluations: item.requiredEvaluations,
    }));
    return json(200, { players });
  }

  // POST /players - Create single player
  if (method === 'POST' && path === '/players') {
    if (!isLead) return json(403, { error: 'Only leads can add players' });
    const body = parseBody(event);
    const id = uuidv4();

    await putItem({
      PK: `TEAM#${teamId}`,
      SK: `PLAYER#${id}`,
      id,
      teamId,
      name: body.name,
      number: body.number,
      primaryPosition: body.primaryPosition || body.primary_position || '',
      secondaryPosition: body.secondaryPosition || body.secondary_position || '',
      requiredEvaluations: parseInt(body.requiredEvaluations || body.required_evaluations || '3', 10),
    });

    return json(201, { id });
  }

  // POST /players/upload - Bulk upload players from CSV data
  if (method === 'POST' && path === '/players/upload') {
    if (!isLead) return json(403, { error: 'Only leads can upload players' });
    const { players: rows } = parseBody(event);

    if (!Array.isArray(rows)) return json(400, { error: 'Expected players array' });

    const items = rows.map((row: any) => {
      const id = uuidv4();
      return {
        PK: `TEAM#${teamId}`,
        SK: `PLAYER#${id}`,
        id,
        teamId,
        name: row.name,
        number: row.number || '',
        primaryPosition: row.primary_position || '',
        secondaryPosition: row.secondary_position || '',
        requiredEvaluations: parseInt(row.required_evaluations || '3', 10),
      };
    });

    await batchPutItems(items);
    return json(201, { count: items.length, ids: items.map((i) => i.id) });
  }

  // PUT /players/:id
  if (method === 'PUT' && path.match(/^\/players\/[\w-]+$/)) {
    if (!isLead) return json(403, { error: 'Only leads can edit players' });
    const playerId = path.split('/')[2];
    const body = parseBody(event);

    const updates: Record<string, any> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.number !== undefined) updates.number = body.number;
    if (body.primaryPosition !== undefined) updates.primaryPosition = body.primaryPosition;
    if (body.secondaryPosition !== undefined) updates.secondaryPosition = body.secondaryPosition;
    if (body.requiredEvaluations !== undefined) updates.requiredEvaluations = parseInt(body.requiredEvaluations, 10);

    await updateItem(`TEAM#${teamId}`, `PLAYER#${playerId}`, updates);
    return json(200, { updated: true });
  }

  // DELETE /players/:id
  if (method === 'DELETE' && path.match(/^\/players\/[\w-]+$/)) {
    if (!isLead) return json(403, { error: 'Only leads can delete players' });
    const playerId = path.split('/')[2];
    await deleteItem(`TEAM#${teamId}`, `PLAYER#${playerId}`);
    return json(200, { deleted: true });
  }

  // === Coach routes ===

  // GET /coaches
  if (method === 'GET' && path === '/coaches') {
    const items = await queryItems(`TEAM#${teamId}`, 'COACH#');
    const coaches = items.map((item) => ({
      id: item.id,
      name: item.name,
      email: item.email,
      maxPlayers: item.maxPlayers,
      isLead: item.isLead || false,
    }));
    return json(200, { coaches });
  }

  // POST /coaches
  if (method === 'POST' && path === '/coaches') {
    if (!isLead) return json(403, { error: 'Only leads can add coaches' });
    const body = parseBody(event);
    const id = uuidv4();

    await putItem({
      PK: `TEAM#${teamId}`,
      SK: `COACH#${id}`,
      id,
      teamId,
      name: body.name,
      email: body.email,
      maxPlayers: parseInt(body.maxPlayers || body.max_players || '10', 10),
      isLead: body.isLead || false,
    });

    return json(201, { id });
  }

  // POST /coaches/upload - Bulk upload coaches
  if (method === 'POST' && path === '/coaches/upload') {
    if (!isLead) return json(403, { error: 'Only leads can upload coaches' });
    const { coaches: rows } = parseBody(event);

    if (!Array.isArray(rows)) return json(400, { error: 'Expected coaches array' });

    const items = rows.map((row: any) => {
      const id = uuidv4();
      return {
        PK: `TEAM#${teamId}`,
        SK: `COACH#${id}`,
        id,
        teamId,
        name: row.name,
        email: row.email,
        maxPlayers: parseInt(row.max_players || '10', 10),
        isLead: false,
      };
    });

    await batchPutItems(items);
    return json(201, { count: items.length, ids: items.map((i) => i.id) });
  }

  // PUT /coaches/:id
  if (method === 'PUT' && path.match(/^\/coaches\/[\w-]+$/)) {
    if (!isLead) return json(403, { error: 'Only leads can edit coaches' });
    const coachIdToUpdate = path.split('/')[2];
    const body = parseBody(event);

    const updates: Record<string, any> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.email !== undefined) updates.email = body.email;
    if (body.maxPlayers !== undefined) updates.maxPlayers = parseInt(body.maxPlayers, 10);
    if (body.isLead !== undefined) updates.isLead = body.isLead;

    await updateItem(`TEAM#${teamId}`, `COACH#${coachIdToUpdate}`, updates);
    return json(200, { updated: true });
  }

  // DELETE /coaches/:id
  if (method === 'DELETE' && path.match(/^\/coaches\/[\w-]+$/)) {
    if (!isLead) return json(403, { error: 'Only leads can delete coaches' });
    const coachIdToDelete = path.split('/')[2];
    await deleteItem(`TEAM#${teamId}`, `COACH#${coachIdToDelete}`);
    return json(200, { deleted: true });
  }

  // GET /coaches/invite-link
  if (method === 'GET' && path === '/coaches/invite-link') {
    if (!isLead) return json(403, { error: 'Only leads can get invite link' });
    const teamMeta = await getItem(`TEAM#${teamId}`, 'META');
    if (!teamMeta) return json(404, { error: 'Team not found' });

    const baseUrl = process.env.BASE_URL || 'http://localhost:5173';
    const link = `${baseUrl}/signup?invite=${teamMeta.inviteCode}`;
    return json(200, { inviteLink: link, inviteCode: teamMeta.inviteCode });
  }

  // === Assignment routes ===

  // GET /assignments
  if (method === 'GET' && path === '/assignments') {
    const items = await queryItems(`TEAM#${teamId}`, 'ASSIGN#');
    const assignments = items.map((item) => ({
      coachId: item.coachId,
      playerId: item.playerId,
    }));
    return json(200, { assignments });
  }

  // POST /assignments/auto - Auto-assign based on algorithm
  if (method === 'POST' && path === '/assignments/auto') {
    if (!isLead) return json(403, { error: 'Only leads can auto-assign' });

    // Get all players and coaches
    const playerItems = await queryItems(`TEAM#${teamId}`, 'PLAYER#');
    const coachItems = await queryItems(`TEAM#${teamId}`, 'COACH#');

    const players: Player[] = playerItems.map((p) => ({
      id: p.id,
      teamId,
      name: p.name,
      number: p.number,
      primaryPosition: p.primaryPosition,
      secondaryPosition: p.secondaryPosition,
      requiredEvaluations: p.requiredEvaluations || 3,
    }));

    const coaches: Coach[] = coachItems.map((c) => ({
      id: c.id,
      teamId,
      name: c.name,
      email: c.email,
      maxPlayers: c.maxPlayers || 10,
      isLead: c.isLead || false,
    }));

    const newAssignments = computeAssignments(players, coaches, teamId);

    // Clear existing assignments
    const existingAssignments = await queryItems(`TEAM#${teamId}`, 'ASSIGN#');
    for (const existing of existingAssignments) {
      await deleteItem(`TEAM#${teamId}`, existing.SK);
    }

    // Write new assignments
    const items = newAssignments.map((a) => ({
      PK: `TEAM#${teamId}`,
      SK: `ASSIGN#${a.coachId}#${a.playerId}`,
      coachId: a.coachId,
      playerId: a.playerId,
      teamId,
    }));

    await batchPutItems(items);
    return json(200, { assignments: newAssignments, count: newAssignments.length });
  }

  // POST /assignments - Manual assignment add
  if (method === 'POST' && path === '/assignments') {
    if (!isLead) return json(403, { error: 'Only leads can manage assignments' });
    const { coachId: assignCoachId, playerId } = parseBody(event);

    await putItem({
      PK: `TEAM#${teamId}`,
      SK: `ASSIGN#${assignCoachId}#${playerId}`,
      coachId: assignCoachId,
      playerId,
      teamId,
    });

    return json(201, { assigned: true });
  }

  // DELETE /assignments/:coachId/:playerId
  if (method === 'DELETE' && path.match(/^\/assignments\/[\w-]+\/[\w-]+$/)) {
    if (!isLead) return json(403, { error: 'Only leads can manage assignments' });
    const parts = path.split('/');
    const assignCoachId = parts[2];
    const playerId = parts[3];

    await deleteItem(`TEAM#${teamId}`, `ASSIGN#${assignCoachId}#${playerId}`);
    return json(200, { deleted: true });
  }

  // === Evaluation routes ===

  // GET /evaluations - Get evaluations (lead sees all, coach sees own)
  if (method === 'GET' && path === '/evaluations') {
    const items = await queryItems(`TEAM#${teamId}`, 'EVAL#');
    let evaluations = items.map((item) => ({
      id: item.id,
      coachId: item.coachId,
      playerId: item.playerId,
      attitude: item.attitude,
      effort: item.effort,
      footballIQ: item.footballIQ,
      generalSkill: item.generalSkill,
      positionSkill: item.positionSkill,
      totalScore: item.totalScore,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));

    // Non-leads only see their own evaluations in detail
    if (!isLead) {
      evaluations = evaluations.filter((e) => e.coachId === coachId);
    }

    return json(200, { evaluations });
  }

  // GET /evaluations/summary - Summary stats for all players (visible to all)
  if (method === 'GET' && path === '/evaluations/summary') {
    const items = await queryItems(`TEAM#${teamId}`, 'EVAL#');
    const playerItems = await queryItems(`TEAM#${teamId}`, 'PLAYER#');

    // Build summary per player
    const playerMap = new Map(playerItems.map((p) => [p.id, p]));
    const summaryMap: Record<string, { ratings: number[][]; player: any }> = {};

    for (const item of items) {
      if (!summaryMap[item.playerId]) {
        summaryMap[item.playerId] = {
          player: playerMap.get(item.playerId),
          ratings: [],
        };
      }
      summaryMap[item.playerId].ratings.push([
        item.attitude,
        item.effort,
        item.footballIQ,
        item.generalSkill,
        item.positionSkill,
      ]);
    }

    const summary = Object.entries(summaryMap).map(([playerId, data]) => {
      const count = data.ratings.length;
      const avgAttitude = data.ratings.reduce((s, r) => s + r[0], 0) / count;
      const avgEffort = data.ratings.reduce((s, r) => s + r[1], 0) / count;
      const avgFootballIQ = data.ratings.reduce((s, r) => s + r[2], 0) / count;
      const avgGeneralSkill = data.ratings.reduce((s, r) => s + r[3], 0) / count;
      const avgPositionSkill = data.ratings.reduce((s, r) => s + r[4], 0) / count;
      const avgTotal = avgAttitude + avgEffort + avgFootballIQ + avgGeneralSkill + avgPositionSkill;

      return {
        playerId,
        playerName: data.player?.name || 'Unknown',
        playerNumber: data.player?.number || '',
        evaluationCount: count,
        avgAttitude: Math.round(avgAttitude * 10) / 10,
        avgEffort: Math.round(avgEffort * 10) / 10,
        avgFootballIQ: Math.round(avgFootballIQ * 10) / 10,
        avgGeneralSkill: Math.round(avgGeneralSkill * 10) / 10,
        avgPositionSkill: Math.round(avgPositionSkill * 10) / 10,
        avgTotal: Math.round(avgTotal * 10) / 10,
      };
    });

    return json(200, { summary });
  }

  // GET /evaluations/player/:playerId - Detailed evaluations for a player (lead only)
  if (method === 'GET' && path.match(/^\/evaluations\/player\/[\w-]+$/)) {
    if (!isLead) return json(403, { error: 'Only leads can see detailed player evaluations' });
    const playerId = path.split('/')[3];

    const items = await queryItems(`TEAM#${teamId}`, 'EVAL#');
    const playerEvals = items.filter((item) => item.playerId === playerId);
    const coachItems = await queryItems(`TEAM#${teamId}`, 'COACH#');
    const coachMap = new Map(coachItems.map((c) => [c.id, c]));

    const evaluations = playerEvals.map((item) => ({
      coachId: item.coachId,
      coachName: coachMap.get(item.coachId)?.name || 'Unknown',
      attitude: item.attitude,
      effort: item.effort,
      footballIQ: item.footballIQ,
      generalSkill: item.generalSkill,
      positionSkill: item.positionSkill,
      totalScore: item.totalScore,
    }));

    return json(200, { playerId, evaluations });
  }

  // POST /evaluations - Submit evaluation
  if (method === 'POST' && path === '/evaluations') {
    const body = parseBody(event);
    const { playerId, attitude, effort, footballIQ, generalSkill, positionSkill } = body;

    if (!playerId) return json(400, { error: 'playerId required' });

    // Verify this coach is assigned to this player
    const assignItem = await getItem(`TEAM#${teamId}`, `ASSIGN#${coachId}#${playerId}`);
    if (!assignItem && !isLead) {
      return json(403, { error: 'You are not assigned to evaluate this player' });
    }

    // Check if already evaluated
    const existingEvals = await queryItems(`TEAM#${teamId}`, 'EVAL#');
    const existing = existingEvals.find(
      (e) => e.coachId === coachId && e.playerId === playerId
    );

    const scores = {
      attitude: Math.min(10, Math.max(1, parseInt(attitude, 10))),
      effort: Math.min(10, Math.max(1, parseInt(effort, 10))),
      footballIQ: Math.min(10, Math.max(1, parseInt(footballIQ, 10))),
      generalSkill: Math.min(10, Math.max(1, parseInt(generalSkill, 10))),
      positionSkill: Math.min(10, Math.max(1, parseInt(positionSkill, 10))),
    };
    const totalScore = scores.attitude + scores.effort + scores.footballIQ + scores.generalSkill + scores.positionSkill;

    if (existing) {
      // Update existing evaluation
      await updateItem(`TEAM#${teamId}`, existing.SK, {
        ...scores,
        totalScore,
        updatedAt: new Date().toISOString(),
      });
      return json(200, { updated: true, id: existing.id });
    }

    const id = uuidv4();
    await putItem({
      PK: `TEAM#${teamId}`,
      SK: `EVAL#${coachId}#${playerId}`,
      id,
      teamId,
      coachId,
      playerId,
      ...scores,
      totalScore,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return json(201, { id });
  }

  // === My assignments (for coach view) ===
  if (method === 'GET' && path === '/my-players') {
    const items = await queryItems(`TEAM#${teamId}`, 'ASSIGN#');
    const myAssignments = items.filter((item) => item.coachId === coachId);
    const playerItems = await queryItems(`TEAM#${teamId}`, 'PLAYER#');
    const playerMap = new Map(playerItems.map((p) => [p.id, p]));

    // Get my evaluations
    const evalItems = await queryItems(`TEAM#${teamId}`, 'EVAL#');
    const myEvals = evalItems.filter((e) => e.coachId === coachId);
    const evalMap = new Map(myEvals.map((e) => [e.playerId, e]));

    const players = myAssignments.map((a) => {
      const player = playerMap.get(a.playerId);
      const evaluation = evalMap.get(a.playerId);
      return {
        id: a.playerId,
        name: player?.name || 'Unknown',
        number: player?.number || '',
        primaryPosition: player?.primaryPosition || '',
        secondaryPosition: player?.secondaryPosition || '',
        evaluated: !!evaluation,
        evaluation: evaluation
          ? {
              attitude: evaluation.attitude,
              effort: evaluation.effort,
              footballIQ: evaluation.footballIQ,
              generalSkill: evaluation.generalSkill,
              positionSkill: evaluation.positionSkill,
              totalScore: evaluation.totalScore,
            }
          : null,
      };
    });

    return json(200, { players });
  }

  return json(404, { error: 'Not found' });
}
