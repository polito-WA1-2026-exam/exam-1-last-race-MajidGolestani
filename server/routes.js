import express from 'express';
import passport from 'passport';
import { requireAuth } from './auth.js';
import {
  advanceToPlanning,
  autoEndPlanning,
  createGame,
  getGameForUser,
  getLeaderboard,
  getLeaderboardStats,
  getPlanningPayload,
  submitRoute,
  getNetworkFull,
  getAllEvents,
} from './gameService.js';

const router = express.Router();

router.post('/login', (req, res, next) => {
  if (!req.body?.username || !req.body?.password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      return res.status(401).json({ error: info?.message || 'Login failed' });
    }
    req.logIn(user, (loginErr) => {
      if (loginErr) return next(loginErr);
      return res.json({ id: user.id, username: user.username });
    });
  })(req, res, next);
});

router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ ok: true });
    });
  });
});

router.get('/session', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json({ id: req.user.id, username: req.user.username });
});

router.get('/network', requireAuth, (req, res) => {
  const network = getNetworkFull();
  res.json({
    lines: network.lines,
    stations: network.stations.map((s) => ({
      id: s.id,
      name: s.name,
      mapX: s.map_x,
      mapY: s.map_y,
    })),
    lineStations: network.lineStations,
    segments: network.segments.map((s) => ({
      stationAId: s.station_a_id,
      stationBId: s.station_b_id,
      lineId: s.line_id,
    })),
    interchanges: network.interchanges,
  });
});

router.get('/events', (req, res) => {
  try {
    const events = getAllEvents();
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/leaderboard', requireAuth, (req, res) => {
  res.json({
    ranking: getLeaderboard(),
    stats: getLeaderboardStats()
  });
});

router.post('/games', requireAuth, (req, res) => {
  const game = createGame(req.user.id);
  res.status(201).json(game);
});

router.get('/games/:id', requireAuth, (req, res) => {
  const game = getGameForUser(Number(req.params.id), req.user.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  res.json(game);
});

router.post('/games/:id/planning', requireAuth, (req, res) => {
  const gameId = Number(req.params.id);
  const game = advanceToPlanning(gameId, req.user.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });

  const payload = getPlanningPayload();
  res.json({
    game,
    ...payload,
  });
});

router.put('/games/:id/route', requireAuth, (req, res) => {
  const gameId = Number(req.params.id);
  const route = req.body?.route;
  if (!Array.isArray(route)) {
    return res.status(400).json({ error: 'Route must be an array of segments' });
  }

  for (const seg of route) {
    if (
      typeof seg.stationAId !== 'number' ||
      typeof seg.stationBId !== 'number'
    ) {
      return res.status(400).json({ error: 'Invalid segment format' });
    }
  }

  const game = submitRoute(gameId, req.user.id, route);
  if (!game) return res.status(404).json({ error: 'Game not found or wrong phase' });
  res.json(game);
});

router.post('/games/:id/timeout', requireAuth, (req, res) => {
  const gameId = Number(req.params.id);
  const route = Array.isArray(req.body?.route) ? req.body.route : [];
  const game = autoEndPlanning(gameId, req.user.id, route);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  res.json(game);
});

export default router;
