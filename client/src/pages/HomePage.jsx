import { useEffect, useState } from 'react';
import { Alert, Button, Spinner, Table } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

export default function HomePage() {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.events()
      .then((data) => {
        if (active) {
          setEvents(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError('Could not retrieve events from the server.');
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="py-2">
      {/* Title Hero Banner */}
      <div className="text-center py-3 px-4 mb-4 border rounded-3 bg-white shadow-sm">
        <h1 className="h2 fw-bold mb-1 text-dark">
          Last Race
        </h1>
        <p className="text-primary fw-medium small mb-2 text-uppercase-tracking" style={{ fontSize: '0.8rem' }}>
          Underground Network Memory Challenge
        </p>
        <p className="text-muted mx-auto mb-3" style={{ maxWidth: '650px', fontSize: '0.9rem' }}>
          Plan a route through the metro network from memory, survive random events, and reach your destination with the highest coin balance.
        </p>
        
        {/* Three small info cards */}
        <div className="row g-2 justify-content-center mx-auto" style={{ maxWidth: '550px' }}>
          <div className="col-4">
            <div className="p-2 border rounded-3 bg-light d-flex align-items-center justify-content-center gap-1">
              <span className="fs-6">🗺️</span>
              <span className="small text-dark fw-medium">12 Stations</span>
            </div>
          </div>
          <div className="col-4">
            <div className="p-2 border rounded-3 bg-light d-flex align-items-center justify-content-center gap-1">
              <span className="fs-6">🔀</span>
              <span className="small text-dark fw-medium">4 Lines</span>
            </div>
          </div>
          <div className="col-4">
            <div className="p-2 border rounded-3 bg-light d-flex align-items-center justify-content-center gap-1">
              <span className="fs-6">🧠</span>
              <span className="small text-dark fw-medium">90s Planning</span>
            </div>
          </div>
        </div>
      </div>
 
      {/* Starting budget notification */}
      <div className="alert alert-info d-flex align-items-center mb-4 border-0 p-3" role="alert">
        <span className="badge bg-primary text-info fs-6 me-3 px-3 py-2">
          🪙 20 Coins
        </span>
        <div>
          <strong>Starting Balance:</strong> Every game starts with a fixed budget of <strong>20 coins</strong>. Random transit events will add or deduct coins along your path.
        </div>
      </div>
 
      {/* Instruction Steps Layout */}
      <div className="card mb-4 border-0 shadow-sm">
        <div className="card-header bg-transparent py-3">
          <h3 className="h5 mb-0 text-dark d-flex align-items-center gap-2">
            <span>🧠</span> Memorization Challenge & Gameplay Loop
          </h3>
        </div>
        <div className="card-body">
          <div className="row g-4">
            {[
              { step: '1', title: 'Setup', desc: 'Study the full metro network map. Memorize lines and station connections before starting!' },
              { step: '2', title: 'Planning', desc: 'You have 90s to build a route from start to dest. Connections are hidden; rely on memory!' },
              { step: '3', title: 'Execution', desc: 'Each segment triggers a random event (between -4 and +4 coins) affecting your balance.' },
              { step: '4', title: 'Result', desc: 'Your final score is the remaining coins. Reach the destination or get disqualified (0 score)!' }
            ].map((s) => (
              <div key={s.step} className="col-12 col-md-3">
                <div className="h-100 p-3 rounded-3 border bg-light">
                  <div className="d-flex align-items-center gap-2 mb-2">
                    <span className="badge bg-secondary rounded-circle d-inline-flex align-items-center justify-content-center" style={{ width: '24px', height: '24px', padding: 0 }}>{s.step}</span>
                    <strong className="text-dark">{s.title}</strong>
                  </div>
                  <p className="text-muted small mb-0">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
 
      <p className="text-muted small mb-4">
        ⚠️ <strong>Transit Regulations:</strong> Routes must follow metro lines. You may change lines <strong className="text-warning">ONLY at interchange stations</strong>. Each segment can be used at most once; revisiting stations is allowed.
      </p>
 
      {/* Event list */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-transparent py-3">
          <h3 className="h5 mb-0 text-dark d-flex align-items-center gap-2">
            Possible Journey Events
          </h3>
        </div>
        <div className="card-body p-0">
          {loading ? (
            <div className="text-center py-4 text-muted">
              <Spinner animation="border" size="sm" className="me-2" /> Loading events...
            </div>
          ) : error ? (
            <Alert variant="danger" className="m-3">{error}</Alert>
          ) : (
            <Table hover responsive className="mb-0 text-center align-middle">
              <thead>
                <tr>
                  <th className="text-start ps-4">Event Description</th>
                  <th style={{ width: '200px' }}>Coin Effect</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev.id}>
                    <td className="text-start ps-4 text-dark">{ev.description}</td>
                    <td>
                      <span 
                        className={`event-badge ${
                          ev.effect > 0 ? 'event-badge-positive' : 
                          ev.effect < 0 ? 'event-badge-negative' : 
                          'event-badge-neutral'
                        }`}
                      >
                        🪙 {ev.effect > 0 ? `+${ev.effect}` : ev.effect} Coins
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </div>
 
      {/* Play CTA panel */}
      {!user ? (
        <div className="card text-center my-5 border-0 shadow-sm bg-white">
          <div className="card-body p-5">
            <h2 className="card-title mb-3 text-dark">Ready to plan your escape?</h2>
            <p className="card-text text-muted mb-4 fs-6 mx-auto" style={{ maxWidth: '600px' }}>
              Take control of the metro network, dodge delays, claim rewards, and climb the leaderboard. Log in now to begin your journey!
            </p>
            
            <div className="row g-3 justify-content-center mb-4 text-start small" style={{ maxWidth: '600px', margin: '0 auto' }}>
              <div className="col-12 col-sm-6">
                <div className="d-flex align-items-center gap-2">
                  <span className="text-success fs-5">✓</span>
                  <span className="text-muted"><strong>Live Map:</strong> Access the live underground network map</span>
                </div>
              </div>
              <div className="col-12 col-sm-6">
                <div className="d-flex align-items-center gap-2">
                  <span className="text-success fs-5">✓</span>
                  <span className="text-muted"><strong>Route Planning:</strong> Choose segments & build paths</span>
                </div>
              </div>
              <div className="col-12 col-sm-6">
                <div className="d-flex align-items-center gap-2">
                  <span className="text-success fs-5">✓</span>
                  <span className="text-muted"><strong>Live Events:</strong> Trigger probabilistic delays and bonuses</span>
                </div>
              </div>
              <div className="col-12 col-sm-6">
                <div className="d-flex align-items-center gap-2">
                  <span className="text-success fs-5">✓</span>
                  <span className="text-muted"><strong>Ranking:</strong> Save and compete for the top score</span>
                </div>
              </div>
            </div>
 
            <Button as={Link} to="/login" variant="primary" size="lg" className="px-5 py-3 shadow-sm">
              🔑 Log in to play
            </Button>
          </div>
        </div>
      ) : (
        <div className="text-center my-5">
          <Button as={Link} to="/play" variant="primary" size="lg" className="px-5 py-3 shadow-sm">
            🎮 Start a new game
          </Button>
        </div>
      )}
    </div>
  );
}
