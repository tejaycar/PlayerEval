import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { putItem, getItem, queryItems, deleteItem, batchPutItems, updateItem, scanForTeamByName } from '../db';
import { authenticateRequest, issueJWT, generatePin, verifyPin } from '../auth';
import { computeAssignments } from '../assignment';
import { computeAnalysis } from '../analysis';
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

  // POST /auth/login - Login with email + PIN + team name
  if (method === 'POST' && path === '/auth/login') {
    const { email, pin, teamName, inviteCode } = parseBody(event);
    if (!email || !pin) return json(400, { error: 'email and pin are required' });
    if (!teamName && !inviteCode) return json(400, { error: 'teamName or inviteCode is required' });

    let teamId: string;

    if (inviteCode) {
      // Support invite code as fallback
      const inviteItem = await getItem(`INVITE#${inviteCode}`, 'META');
      if (!inviteItem) return json(422, { error: 'Invalid invite code' });
      teamId = inviteItem.teamId;
    } else {
      // Look up team by name (case-insensitive scan)
      const foundTeamId = await scanForTeamByName(teamName);
      if (!foundTeamId) return json(422, { error: `Team "${teamName}" not found` });
      teamId = foundTeamId;
    }

    const coaches = await queryItems(`TEAM#${teamId}`, 'COACH#');
    const coach = coaches.find((c: any) => c.email.toLowerCase() === email.toLowerCase());
    if (!coach) return json(422, { error: 'Coach not found with this email on that team' });

    if (!verifyPin(coach.pin, pin)) return json(401, { error: 'Invalid PIN' });

    const jwtPayload: JWTPayload = {
      coachId: coach.id,
      teamId,
      email,
      isLead: coach.isLead || false,
    };

    const jwt = issueJWT(jwtPayload);

    if (coach.pinIsTemporary) {
      return json(200, { token: jwt, mustChangePin: true, coach: { id: coach.id, name: coach.name, isLead: coach.isLead, teamId } });
    }

    return json(200, { token: jwt, coach: { id: coach.id, name: coach.name, isLead: coach.isLead, teamId } });
  }

  // POST /setup - Create a new team + lead coach (one-time setup, no auth required)
  if (method === 'POST' && path === '/setup') {
    const { teamName, leadName, leadEmail, leadPin } = parseBody(event);
    if (!teamName || !leadName || !leadEmail) {
      return json(400, { error: 'teamName, leadName, and leadEmail are required' });
    }

    const teamId = uuidv4();
    const coachId = uuidv4();
    const inviteCode = uuidv4().slice(0, 8);

    // Create team
    await putItem({
      PK: `TEAM#${teamId}`,
      SK: 'META',
      id: teamId,
      name: teamName,
      leadEmail,
      inviteCode,
      createdAt: new Date().toISOString(),
    });

    // Store invite code lookup
    await putItem({
      PK: `INVITE#${inviteCode}`,
      SK: 'META',
      teamId,
    });

    // Create lead coach with PIN
    const pin = leadPin || generatePin();
    await putItem({
      PK: `TEAM#${teamId}`,
      SK: `COACH#${coachId}`,
      id: coachId,
      teamId,
      name: leadName,
      email: leadEmail,
      maxPlayers: 20,
      isLead: true,
      pin,
      pinIsTemporary: !leadPin,
    });

    // Issue JWT directly
    const jwtPayload: JWTPayload = {
      coachId,
      teamId,
      email: leadEmail,
      isLead: true,
    };
    const jwtToken = issueJWT(jwtPayload);

    return json(201, {
      token: jwtToken,
      coach: { id: coachId, name: leadName, isLead: true, teamId, email: leadEmail },
      teamId,
      inviteCode,
    });
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

  // POST /auth/change-pin - Change PIN (requires auth)
  if (method === 'POST' && path === '/auth/change-pin') {
    const { currentPin, newPin } = parseBody(event);
    if (!currentPin || !newPin) return json(400, { error: 'currentPin and newPin are required' });

    if (newPin.length < 4) return json(400, { error: 'New PIN must be at least 4 characters' });

    // Get coach record
    const coachRecord = await getItem(`TEAM#${teamId}`, `COACH#${coachId}`);
    if (!coachRecord) return json(422, { error: 'Coach not found' });

    if (!verifyPin(coachRecord.pin, currentPin)) return json(401, { error: 'Current PIN is incorrect' });

    // Update PIN
    await updateItem(`TEAM#${teamId}`, `COACH#${coachId}`, { pin: newPin, pinIsTemporary: false });

    // Issue a new JWT
    const jwtPayload: JWTPayload = {
      coachId,
      teamId,
      email: user.email,
      isLead,
    };
    const newToken = issueJWT(jwtPayload);

    return json(200, { token: newToken, coach: { id: coachId, name: coachRecord.name, isLead, teamId, email: user.email } });
  }

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
      isNew: item.isNew || false,
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
      isNew: body.isNew || false,
    });

    return json(201, { id });
  }

  // POST /players/upload - Bulk upload players from CSV data (upsert by number)
  if (method === 'POST' && path === '/players/upload') {
    if (!isLead) return json(403, { error: 'Only leads can upload players' });
    const { players: rows } = parseBody(event);

    if (!Array.isArray(rows)) return json(400, { error: 'Expected players array' });

    // Query existing players to match by number for upsert
    const existingPlayers = await queryItems(`TEAM#${teamId}`, 'PLAYER#');
    const numberToExisting = new Map<string, any>();
    for (const p of existingPlayers) {
      if (p.number) {
        numberToExisting.set(String(p.number), p);
      }
    }

    const items: any[] = [];
    const updatedIds: string[] = [];
    const createdIds: string[] = [];

    for (const row of rows) {
      const rowNumber = String(row.number || '');
      const existing = rowNumber ? numberToExisting.get(rowNumber) : undefined;

      if (existing) {
        // Update existing player
        const updates: Record<string, any> = {
          name: row.name,
          number: rowNumber,
          primaryPosition: row.primary_position || '',
          secondaryPosition: row.secondary_position || '',
          requiredEvaluations: parseInt(row.required_evaluations || '3', 10),
          isNew: row.is_new === 'true' || row.is_new === '1' || row.is_new === 'yes',
        };
        await updateItem(`TEAM#${teamId}`, `PLAYER#${existing.id}`, updates);
        updatedIds.push(existing.id);
      } else {
        // Create new player
        const id = uuidv4();
        items.push({
          PK: `TEAM#${teamId}`,
          SK: `PLAYER#${id}`,
          id,
          teamId,
          name: row.name,
          number: rowNumber,
          primaryPosition: row.primary_position || '',
          secondaryPosition: row.secondary_position || '',
          requiredEvaluations: parseInt(row.required_evaluations || '3', 10),
          isNew: row.is_new === 'true' || row.is_new === '1' || row.is_new === 'yes',
        });
        createdIds.push(id);
      }
    }

    if (items.length > 0) {
      await batchPutItems(items);
    }

    return json(201, { count: createdIds.length + updatedIds.length, created: createdIds, updated: updatedIds });
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
    if (body.isNew !== undefined) updates.isNew = body.isNew;

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
    const coaches = items.map((item) => {
      const coach: any = {
        id: item.id,
        name: item.name,
        email: item.email,
        maxPlayers: item.maxPlayers,
        isLead: item.isLead || false,
      };
      if (isLead) {
        coach.pin = item.pin;
        coach.pinIsTemporary = item.pinIsTemporary;
      }
      return coach;
    });
    return json(200, { coaches });
  }

  // POST /coaches
  if (method === 'POST' && path === '/coaches') {
    if (!isLead) return json(403, { error: 'Only leads can add coaches' });
    const body = parseBody(event);
    const id = uuidv4();
    const pin = generatePin();

    await putItem({
      PK: `TEAM#${teamId}`,
      SK: `COACH#${id}`,
      id,
      teamId,
      name: body.name,
      email: body.email,
      maxPlayers: parseInt((body.maxPlayers ?? body.max_players ?? '10'), 10),
      isLead: body.isLead || false,
      pin,
      pinIsTemporary: true,
    });

    return json(201, { id, pin });
  }

  // POST /coaches/upload - Bulk upload coaches (upsert by email)
  if (method === 'POST' && path === '/coaches/upload') {
    if (!isLead) return json(403, { error: 'Only leads can upload coaches' });
    const { coaches: rows } = parseBody(event);

    if (!Array.isArray(rows)) return json(400, { error: 'Expected coaches array' });

    // Query existing coaches to match by email for upsert
    const existingCoaches = await queryItems(`TEAM#${teamId}`, 'COACH#');
    const emailToExisting = new Map<string, any>();
    for (const c of existingCoaches) {
      if (c.email) {
        emailToExisting.set(c.email.toLowerCase(), c);
      }
    }

    const items: any[] = [];
    const updatedIds: string[] = [];
    const createdIds: string[] = [];

    for (const row of rows) {
      const rowEmail = (row.email || '').toLowerCase();
      const existing = rowEmail ? emailToExisting.get(rowEmail) : undefined;

      if (existing) {
        // Update existing coach
        const updates: Record<string, any> = {
          name: row.name,
          email: row.email,
          maxPlayers: parseInt(row.max_players ?? '10', 10),
        };
        await updateItem(`TEAM#${teamId}`, `COACH#${existing.id}`, updates);
        updatedIds.push(existing.id);
      } else {
        // Create new coach
        const id = uuidv4();
        const pin = generatePin();
        items.push({
          PK: `TEAM#${teamId}`,
          SK: `COACH#${id}`,
          id,
          teamId,
          name: row.name,
          email: row.email,
          maxPlayers: parseInt(row.max_players ?? '10', 10),
          isLead: false,
          pin,
          pinIsTemporary: true,
        });
        createdIds.push(id);
      }
    }

    if (items.length > 0) {
      await batchPutItems(items);
    }

    return json(201, { count: createdIds.length + updatedIds.length, created: createdIds, updated: updatedIds });
  }

  // POST /coaches/:id/reset-pin - Reset a coach's PIN (lead only)
  if (method === 'POST' && path.match(/^\/coaches\/[\w-]+\/reset-pin$/)) {
    if (!isLead) return json(403, { error: 'Only leads can reset PINs' });
    const coachIdToReset = path.split('/')[2];

    // Verify the coach exists
    const coachToReset = await getItem(`TEAM#${teamId}`, `COACH#${coachIdToReset}`);
    if (!coachToReset) return json(422, { error: 'Coach not found' });

    const pin = generatePin();

    await updateItem(`TEAM#${teamId}`, `COACH#${coachIdToReset}`, { pin, pinIsTemporary: true });

    return json(200, { pin });
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
    if (!teamMeta) return json(422, { error: 'Team not found' });

    const baseUrl = process.env.BASE_URL || 'http://localhost:5173';
    const link = `${baseUrl}/login?invite=${teamMeta.inviteCode}`;
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
      isNew: p.isNew || false,
    }));

    const coaches: Coach[] = coachItems.map((c) => ({
      id: c.id,
      teamId,
      name: c.name,
      email: c.email,
      maxPlayers: c.maxPlayers ?? 10,
      isLead: c.isLead || false,
      pin: c.pin || '',
      pinIsTemporary: c.pinIsTemporary || false,
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

  // DELETE /assignments - Clear all assignments
  if (method === 'DELETE' && path === '/assignments') {
    if (!isLead) return json(403, { error: 'Only leads can manage assignments' });

    const existingAssignments = await queryItems(`TEAM#${teamId}`, 'ASSIGN#');
    for (const existing of existingAssignments) {
      await deleteItem(`TEAM#${teamId}`, existing.SK);
    }

    return json(200, { deleted: true, count: existingAssignments.length });
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

  // POST /evaluations/analysis - Compute normalized analysis (POST to accept excludedCoachIds)
  if (method === 'POST' && path === '/evaluations/analysis') {
    const body = parseBody(event);
    const excludedCoachIds: string[] = body.excludedCoachIds || [];

    const evalItems = await queryItems(`TEAM#${teamId}`, 'EVAL#');
    const playerItems = await queryItems(`TEAM#${teamId}`, 'PLAYER#');
    const coachItems = await queryItems(`TEAM#${teamId}`, 'COACH#');

    const evaluationsData = evalItems.map((item) => ({
      coachId: item.coachId,
      playerId: item.playerId,
      attitude: item.attitude,
      effort: item.effort,
      footballIQ: item.footballIQ,
      generalSkill: item.generalSkill,
      positionSkill: item.positionSkill,
      totalScore: item.totalScore,
    }));

    const playersData = playerItems.map((p) => ({
      id: p.id,
      name: p.name,
      number: p.number,
    }));

    const coachesData = coachItems.map((c) => ({
      id: c.id,
      name: c.name,
    }));

    const analysis = computeAnalysis(evaluationsData, playersData, coachesData, excludedCoachIds, isLead);

    // Non-leads don't get coach reliability data
    if (!isLead) {
      analysis.coachReliability = [];
      analysis.playerImpactWarnings = [];
    }

    return json(200, analysis);
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
