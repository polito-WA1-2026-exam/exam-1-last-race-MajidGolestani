import bcrypt from 'bcrypt';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { getDb } from './db.js';

passport.use(
  new LocalStrategy((username, password, done) => {
    try {
      const db = getDb();
      const user = db
        .prepare('SELECT id, username, password_hash FROM users WHERE username = ?')
        .get(username);

      if (!user) {
        return done(null, false, { message: 'Invalid credentials' });
      }

      const match = bcrypt.compareSync(password, user.password_hash);
      if (!match) {
        return done(null, false, { message: 'Invalid credentials' });
      }

      return done(null, { id: user.id, username: user.username });
    } catch (err) {
      return done(err);
    }
  })
);

passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser((id, done) => {
  try {
    const db = getDb();
    const user = db
      .prepare('SELECT id, username FROM users WHERE id = ?')
      .get(id);
    done(null, user || false);
  } catch (err) {
    done(err);
  }
});

export function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Authentication required' });
}
