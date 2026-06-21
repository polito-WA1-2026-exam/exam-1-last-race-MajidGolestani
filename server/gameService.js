import { getDb } from './db.js';

const PLANNING_SECONDS = 90;

export function getInterchangeStationIds() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT station_id
       FROM line_stations
       GROUP BY station_id
       HAVING COUNT(DISTINCT line_id) > 1`
    )
    .all();
  return new Set(rows.map((r) => r.station_id));
}

export function getNetworkFull() {
  const db = getDb();
  const lines = db.prepare('SELECT id, name, color FROM lines ORDER BY id').all();
  const stations = db
    .prepare('SELECT id, name, map_x, map_y FROM stations ORDER BY id')
    .all();
  const lineStations = db
    .prepare(
      `SELECT ls.line_id, ls.station_id, ls.position, s.name
       FROM line_stations ls
       JOIN stations s ON s.id = ls.station_id
       ORDER BY ls.line_id, ls.position`
    )
    .all();
  const segments = db
    .prepare('SELECT station_a_id, station_b_id, line_id FROM segments')
    .all();

  const uniqueEdges = db
    .prepare(
      `SELECT DISTINCT
         CASE WHEN station_a_id < station_b_id THEN station_a_id ELSE station_b_id END AS a_id,
         CASE WHEN station_a_id < station_b_id THEN station_b_id ELSE station_a_id END AS b_id
       FROM segments`
    )
    .all();

  const interchanges = [...getInterchangeStationIds()];

  return { lines, stations, lineStations, segments, uniqueEdges, interchanges };
}

export function getAllSegmentPairs() {
  const db = getDb();
  return db
    .prepare(
      `SELECT DISTINCT
         CASE WHEN station_a_id < station_b_id THEN station_a_id ELSE station_b_id END AS station_a_id,
         CASE WHEN station_a_id < station_b_id THEN station_b_id ELSE station_a_id END AS station_b_id
       FROM segments
       ORDER BY station_a_id, station_b_id`
    )
    .all();
}

export function buildAdjacency() {
  const db = getDb();
  const edges = db
    .prepare(
      `SELECT station_a_id, station_b_id FROM segments
       UNION
       SELECT station_b_id, station_a_id FROM segments`
    )
    .all();

  const adj = new Map();
  for (const { station_a_id: a, station_b_id: b } of edges) {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a).add(b);
    adj.get(b).add(a);
  }
  return adj;
}

export function segmentDistance(startId, destId) {
  if (startId === destId) return 0;
  const adj = buildAdjacency();
  const queue = [[startId, 0]];
  const visited = new Set([startId]);

  while (queue.length > 0) {
    const [node, dist] = queue.shift();
    for (const next of adj.get(node) || []) {
      if (next === destId) return dist + 1;
      if (!visited.has(next)) {
        visited.add(next);
        queue.push([next, dist + 1]);
      }
    }
  }
  return -1;
}

export function pickRandomStartDest(minSegments = 3) {
  const db = getDb();
  const stations = db.prepare('SELECT id FROM stations').all();
  const ids = stations.map((s) => s.id);

  // Shuffle start ids to ensure randomness
  const shuffledStartIds = [...ids].sort(() => Math.random() - 0.5);

  for (const start of shuffledStartIds) {
    const validDests = ids.filter((dest) => {
      const dist = segmentDistance(start, dest);
      return dist >= minSegments;
    });

    if (validDests.length > 0) {
      const dest = validDests[Math.floor(Math.random() * validDests.length)];
      return { startStationId: start, destStationId: dest };
    }
  }

  throw new Error(`Could not find any station pairs with distance >= ${minSegments}`);
}

function getLinesForEdge(aId, bId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT line_id FROM segments
       WHERE (station_a_id = ? AND station_b_id = ?)
          OR (station_a_id = ? AND station_b_id = ?)`
    )
    .all(aId, bId, bId, aId)
    .map((r) => r.line_id);
}

function edgeExists(aId, bId) {
  return getLinesForEdge(aId, bId).length > 0;
}

export function validateRoute(startId, destId, routePairs) {
  if (!routePairs || routePairs.length === 0) {
    return { valid: false, reason: 'empty' };
  }

  const interchanges = getInterchangeStationIds();
  const first = routePairs[0];
  if (first.stationAId !== startId && first.stationBId !== startId) {
    return { valid: false, reason: 'start' };
  }

  let currentStation =
    first.stationAId === startId ? first.stationBId : first.stationAId;

  if (!edgeExists(first.stationAId, first.stationBId)) {
    return { valid: false, reason: 'segment' };
  }

  let possibleLines = new Set(getLinesForEdge(first.stationAId, first.stationBId));

  const usedEdges = new Set();
  const edgeKey = (a, b) =>
    `${Math.min(a, b)}-${Math.max(a, b)}`;
  usedEdges.add(edgeKey(first.stationAId, first.stationBId));

  for (let i = 1; i < routePairs.length; i++) {
    const pair = routePairs[i];
    const { stationAId: a, stationBId: b } = pair;

    if (a !== currentStation && b !== currentStation) {
      return { valid: false, reason: 'continuity' };
    }

    const nextStation = a === currentStation ? b : a;
    const key = edgeKey(a, b);
    if (usedEdges.has(key)) {
      return { valid: false, reason: 'duplicate' };
    }
    usedEdges.add(key);

    const lines = getLinesForEdge(a, b);
    if (lines.length === 0) return { valid: false, reason: 'segment' };

    const newPossible = new Set();
    const canInterchange = interchanges.has(currentStation);

    for (const l of lines) {
      if (possibleLines.has(l)) {
        newPossible.add(l);
      } else if (canInterchange && possibleLines.size > 0) {
        newPossible.add(l);
      }
    }

    if (newPossible.size === 0) {
      return { valid: false, reason: 'interchange' };
    }

    possibleLines = newPossible;
    currentStation = nextStation;
  }

  if (currentStation !== destId) {
    return { valid: false, reason: 'dest' };
  }

  return { valid: true };
}

export function routePairsFromStationPath(stationIds) {
  const pairs = [];
  for (let i = 0; i < stationIds.length - 1; i++) {
    pairs.push({
      stationAId: stationIds[i],
      stationBId: stationIds[i + 1],
    });
  }
  return pairs;
}

export function createGame(userId) {
  const db = getDb();
  const { startStationId, destStationId } = pickRandomStartDest(3);
  const planningEndsAt = new Date(
    Date.now() + PLANNING_SECONDS * 1000
  ).toISOString();

  const result = db
    .prepare(
      `INSERT INTO games (user_id, start_station_id, dest_station_id, phase, coins, planning_ends_at)
       VALUES (?, ?, ?, 'setup', 20, ?)`
    )
    .run(userId, startStationId, destStationId, planningEndsAt);

  return getGameForUser(result.lastInsertRowid, userId);
}

export function getGameForUser(gameId, userId) {
  const db = getDb();
  const game = db
    .prepare(
      `SELECT g.*,
              ss.name AS start_name, ds.name AS dest_name
       FROM games g
       JOIN stations ss ON ss.id = g.start_station_id
       JOIN stations ds ON ds.id = g.dest_station_id
       WHERE g.id = ? AND g.user_id = ?`
    )
    .get(gameId, userId);

  if (!game) return null;
  return formatGame(game);
}

export function formatGame(row) {
  const route = row.route_json ? JSON.parse(row.route_json) : [];
  const execution = row.execution_json
    ? JSON.parse(row.execution_json)
    : null;

  return {
    id: row.id,
    phase: row.phase,
    coins: row.coins,
    score: row.score,
    startStationId: row.start_station_id,
    destStationId: row.dest_station_id,
    startName: row.start_name,
    destName: row.dest_name,
    route,
    execution,
    planningEndsAt: row.planning_ends_at,
  };
}

export function advanceToPlanning(gameId, userId) {
  const db = getDb();
  const planningEndsAt = new Date(
    Date.now() + PLANNING_SECONDS * 1000
  ).toISOString();

  db.prepare(
    `UPDATE games SET phase = 'planning', planning_ends_at = ?
     WHERE id = ? AND user_id = ? AND phase = 'setup'`
  ).run(planningEndsAt, gameId, userId);

  return getGameForUser(gameId, userId);
}

export function submitRoute(gameId, userId, routePairs) {
  const db = getDb();
  const game = db
    .prepare('SELECT * FROM games WHERE id = ? AND user_id = ?')
    .get(gameId, userId);

  if (!game || game.phase !== 'planning') return null;

  db.prepare(
    `UPDATE games SET route_json = ?, phase = 'execution'
     WHERE id = ?`
  ).run(JSON.stringify(routePairs), gameId);

  return processExecution(gameId, userId);
}

export function autoEndPlanning(gameId, userId, routePairs) {
  const db = getDb();
  const game = db
    .prepare('SELECT * FROM games WHERE id = ? AND user_id = ?')
    .get(gameId, userId);

  if (!game || game.phase !== 'planning') return getGameForUser(gameId, userId);

  const route = routePairs || [];
  db.prepare(
    `UPDATE games SET route_json = ?, phase = 'execution'
     WHERE id = ?`
  ).run(JSON.stringify(route), gameId);

  return processExecution(gameId, userId);
}

function pickRandomEvent(stationIndex) {
  const db = getDb();
  const events = db.prepare('SELECT id, description, effect FROM events').all();

  const badEvents = events.filter((e) => e.effect < 0);
  const goodEvents = events.filter((e) => e.effect >= 0);

  // After passing 4 stations/segments (index >= 4), bad events chance increases to 65% (vs 25% early on)
  const badChance = stationIndex >= 4 ? 0.65 : 0.25;
  const isBad = Math.random() < badChance;

  if (isBad && badEvents.length > 0) {
    return badEvents[Math.floor(Math.random() * badEvents.length)];
  } else if (goodEvents.length > 0) {
    return goodEvents[Math.floor(Math.random() * goodEvents.length)];
  }

  return events[Math.floor(Math.random() * events.length)];
}

export function processExecution(gameId, userId) {
  const db = getDb();
  const game = db
    .prepare(
      `SELECT g.*, ss.name AS start_name, ds.name AS dest_name
       FROM games g
       JOIN stations ss ON ss.id = g.start_station_id
       JOIN stations ds ON ds.id = g.dest_station_id
       WHERE g.id = ? AND g.user_id = ?`
    )
    .get(gameId, userId);

  const routePairs = JSON.parse(game.route_json || '[]');
  const validation = validateRoute(
    game.start_station_id,
    game.dest_station_id,
    routePairs
  );

  if (!validation.valid) {
    db.prepare(
      `UPDATE games SET coins = 0, score = 0, phase = 'result',
       execution_json = ?, finished_at = datetime('now')
       WHERE id = ?`
    ).run(
      JSON.stringify({ valid: false, steps: [], reason: validation.reason }),
      gameId
    );
    return getGameForUser(gameId, userId);
  }

  const stationNames = db.prepare('SELECT id, name FROM stations').all();
  const nameById = Object.fromEntries(stationNames.map((s) => [s.id, s.name]));

  let coins = 20;
  const steps = [];
  let currentStation = game.start_station_id;

  for (let i = 0; i < routePairs.length; i++) {
    const pair = routePairs[i];
    const nextStation =
      pair.stationAId === currentStation
        ? pair.stationBId
        : pair.stationAId;
    const event = pickRandomEvent(i);
    coins += event.effect;
    steps.push({
      fromStationId: currentStation,
      toStationId: nextStation,
      fromName: nameById[currentStation],
      toName: nameById[nextStation],
      event: { description: event.description, effect: event.effect },
      coinsAfter: coins,
    });
    currentStation = nextStation;
  }

  const score = Math.max(0, coins);
  db.prepare(
    `UPDATE games SET coins = ?, score = ?, phase = 'result',
     execution_json = ?, finished_at = datetime('now')
     WHERE id = ?`
  ).run(
    coins,
    score,
    JSON.stringify({ valid: true, steps }),
    gameId
  );

  return getGameForUser(gameId, userId);
}

export function getPlanningPayload() {
  const network = getNetworkFull();
  const segmentPairs = getAllSegmentPairs();
  const stations = network.stations.map(({ id, name, map_x, map_y }) => ({
    id,
    name,
    mapX: map_x,
    mapY: map_y,
  }));

  return {
    stations,
    segmentPairs: segmentPairs.map((p) => ({
      stationAId: p.station_a_id,
      stationBId: p.station_b_id,
    })),
  };
}

export function getLeaderboard() {
  const db = getDb();
  return db
    .prepare(
      `SELECT u.username, MAX(g.score) AS best_score
       FROM users u
       JOIN games g ON g.user_id = u.id
       WHERE g.score IS NOT NULL AND g.phase = 'result'
       GROUP BY u.id
       ORDER BY best_score DESC, u.username ASC`
    )
    .all();
}

export function getAllEvents() {
  const db = getDb();
  return db.prepare('SELECT id, description, effect FROM events ORDER BY id').all();
}

export function getLeaderboardStats() {
  const db = getDb();
  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const completedGames = db.prepare("SELECT COUNT(*) as count FROM games WHERE phase = 'result'").get().count;
  return {
    totalUsers,
    completedGames
  };
}
