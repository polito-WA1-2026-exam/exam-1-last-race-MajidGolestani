import { getDb, closeDb, runMigrationsAndSeed } from './db.js';

const database = getDb();
runMigrationsAndSeed();
closeDb();
console.log('Database initialized at lastrace.sqlite');
