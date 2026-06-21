import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'lastrace.sqlite');
const SALT_ROUNDS = 10;

let db;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('foreign_keys = ON');
  }
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

export function runMigrationsAndSeed() {
  const database = getDb();

  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      map_x REAL NOT NULL,
      map_y REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS line_stations (
      line_id INTEGER NOT NULL,
      station_id INTEGER NOT NULL,
      position INTEGER NOT NULL,
      PRIMARY KEY (line_id, station_id),
      FOREIGN KEY (line_id) REFERENCES lines(id),
      FOREIGN KEY (station_id) REFERENCES stations(id)
    );

    CREATE TABLE IF NOT EXISTS segments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      station_a_id INTEGER NOT NULL,
      station_b_id INTEGER NOT NULL,
      line_id INTEGER NOT NULL,
      FOREIGN KEY (station_a_id) REFERENCES stations(id),
      FOREIGN KEY (station_b_id) REFERENCES stations(id),
      FOREIGN KEY (line_id) REFERENCES lines(id),
      UNIQUE (station_a_id, station_b_id, line_id)
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      effect INTEGER NOT NULL CHECK (effect >= -4 AND effect <= 4)
    );

    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      start_station_id INTEGER NOT NULL,
      dest_station_id INTEGER NOT NULL,
      phase TEXT NOT NULL DEFAULT 'setup',
      coins INTEGER NOT NULL DEFAULT 20,
      route_json TEXT,
      execution_json TEXT,
      score INTEGER,
      planning_ends_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (start_station_id) REFERENCES stations(id),
      FOREIGN KEY (dest_station_id) REFERENCES stations(id)
    );
  `);

  seedNetwork(database);
  seedEvents(database);
  seedUsers(database);
}

function seedNetwork(database) {
  const lineCount = database.prepare('SELECT COUNT(*) AS c FROM lines').get().c;
  if (lineCount > 0) return;

  const lines = [
    { name: 'Red Line', color: '#c0392b' },
    { name: 'Blue Line', color: '#2980b9' },
    { name: 'Green Line', color: '#27ae60' },
    { name: 'Yellow Line', color: '#f1c40f' },
  ];
  const insertLine = database.prepare(
    'INSERT INTO lines (name, color) VALUES (?, ?)'
  );
  for (const line of lines) insertLine.run(line.name, line.color);

  const lineIds = Object.fromEntries(
    database
      .prepare('SELECT id, name FROM lines')
      .all()
      .map((row) => [row.name, row.id])
  );

  const stations = [
    { name: 'Stazione Ovest', map_x: 100, map_y: 80 },
    { name: 'Centrale', map_x: 250, map_y: 80 },
    { name: 'Porta Velaria', map_x: 400, map_y: 80 },
    { name: 'Crocevia del Falco', map_x: 550, map_y: 80 },
    { name: 'Piazza delle Lanterne', map_x: 700, map_y: 80 },
    { name: 'Parco dei Pini', map_x: 850, map_y: 80 },
    { name: 'Fontana Oscura', map_x: 325, map_y: 200 },
    { name: 'Borgo Sereno', map_x: 475, map_y: 200 },
    { name: 'Viale dei Mosaici', map_x: 625, map_y: 200 },
    { name: 'Lago Sotterraneo', map_x: 775, map_y: 200 },
    { name: 'Torre Cinerea', map_x: 475, map_y: 320 },
    { name: "Campo dell'Eco", map_x: 625, map_y: 320 },
    { name: 'Mercato Antico', map_x: 775, map_y: 320 },
    { name: 'Belvedere', map_x: 700, map_y: 320 },
  ];

  const insertStation = database.prepare(
    'INSERT INTO stations (name, map_x, map_y) VALUES (?, ?, ?)'
  );
  for (const s of stations) insertStation.run(s.name, s.map_x, s.map_y);

  const stationIds = Object.fromEntries(
    database
      .prepare('SELECT id, name FROM stations')
      .all()
      .map((row) => [row.name, row.id])
  );

  const lineRoutes = {
    'Red Line': [
      'Stazione Ovest',
      'Centrale',
      'Porta Velaria',
      'Crocevia del Falco',
      'Piazza delle Lanterne',
      'Parco dei Pini',
    ],
    'Blue Line': [
      'Centrale',
      'Fontana Oscura',
      'Borgo Sereno',
      'Viale dei Mosaici',
      'Lago Sotterraneo',
    ],
    'Green Line': [
      'Porta Velaria',
      'Fontana Oscura',
      'Torre Cinerea',
      "Campo dell'Eco",
      'Mercato Antico',
    ],
    'Yellow Line': [
      'Piazza delle Lanterne',
      'Torre Cinerea',
      'Viale dei Mosaici',
      "Campo dell'Eco",
      'Belvedere',
    ],
  };

  const insertLineStation = database.prepare(
    'INSERT INTO line_stations (line_id, station_id, position) VALUES (?, ?, ?)'
  );
  const insertSegment = database.prepare(
    'INSERT INTO segments (station_a_id, station_b_id, line_id) VALUES (?, ?, ?)'
  );

  for (const [lineName, route] of Object.entries(lineRoutes)) {
    const lineId = lineIds[lineName];
    route.forEach((stationName, index) => {
      const stationId = stationIds[stationName];
      insertLineStation.run(lineId, stationId, index);
      if (index > 0) {
        const prevId = stationIds[route[index - 1]];
        insertSegment.run(prevId, stationId, lineId);
        insertSegment.run(stationId, prevId, lineId);
      }
    });
  }
}

function seedEvents(database) {
  const count = database.prepare('SELECT COUNT(*) AS c FROM events').get().c;
  if (count > 0) return;

  const events = [
    { description: 'Quiet journey', effect: 0 },
    { description: 'Wrong platform', effect: -2 },
    { description: 'Kind passenger', effect: 1 },
    { description: 'Signal failure delay', effect: -3 },
    { description: 'Found a lucky token', effect: 2 },
    { description: 'Street musician on board', effect: 1 },
    { description: 'Lost wallet', effect: -4 },
    { description: 'Tourist tips you', effect: 3 },
    { description: 'Maintenance works', effect: -1 },
    { description: 'Free coffee voucher', effect: 2 },
  ];

  const insert = database.prepare(
    'INSERT INTO events (description, effect) VALUES (?, ?)'
  );
  for (const ev of events) insert.run(ev.description, ev.effect);
}

function seedUsers(database) {
  const count = database.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) return;

  const users = [
    { username: 'marco', password: 'metro2026!' },
    { username: 'giulia', password: 'rails456' },
    { username: 'luca', password: 'lastrace1' },
    { username: 'majid', password: 'MjQ11@' },
  ];

  const insert = database.prepare(
    'INSERT INTO users (username, password_hash) VALUES (?, ?)'
  );
  for (const u of users) {
    const hash = bcrypt.hashSync(u.password, SALT_ROUNDS);
    insert.run(u.username, hash);
  }

  const marcoId = database
    .prepare('SELECT id FROM users WHERE username = ?')
    .get('marco').id;
  const giuliaId = database
    .prepare('SELECT id FROM users WHERE username = ?')
    .get('giulia').id;

  const centrale = database
    .prepare('SELECT id FROM stations WHERE name = ?')
    .get('Centrale').id;
  const parco = database
    .prepare('SELECT id FROM stations WHERE name = ?')
    .get('Parco dei Pini').id;
  const campo = database
    .prepare('SELECT id FROM stations WHERE name = ?')
    .get("Campo dell'Eco").id;

  const insertGame = database.prepare(`
    INSERT INTO games (user_id, start_station_id, dest_station_id, phase, coins, score, route_json, finished_at)
    VALUES (?, ?, ?, 'result', 20, ?, '[]', datetime('now'))
  `);

  insertGame.run(marcoId, centrale, parco, 18);
  insertGame.run(marcoId, centrale, campo, 12);
  insertGame.run(giuliaId, centrale, parco, 22);
}
