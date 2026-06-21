import { useEffect, useState } from 'react';
import { Alert, Spinner, Table } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [ranking, setRanking] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .leaderboard()
      .then((data) => {
        setRanking(data.ranking || []);
        setStats(data.stats || null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" variant="primary" />
      </div>
    );
  }

  const highestScore = ranking.length > 0 ? Math.max(...ranking.map((r) => r.best_score)) : 0;
  const registeredPlayers = stats?.totalUsers ?? ranking.length;
  const completedGames = stats?.completedGames ?? 0;

  return (
    <div className="container py-2">
      {/* Leaderboard Header */}
      <div className="text-center mb-4">
        <h2 className="d-flex align-items-center justify-content-center gap-2 mb-1" style={{ fontSize: '1.6rem' }}>
          <span>🏆</span> General Ranking
        </h2>
        <p className="text-muted mb-0 small">
          Compete with other students and reach the top of the leaderboard.
        </p>
      </div>
 
      {error && <Alert variant="danger">{error}</Alert>}
 
      {/* Statistics Cards */}
      <div className="row g-3 mb-4 justify-content-center" style={{ maxWidth: '750px', margin: '0 auto' }}>
        <div className="col-12 col-md-4">
          <div className="card border-0 text-center py-3">
            <div className="fs-3 mb-1">🔥</div>
            <div className="text-muted small text-uppercase fw-bold mb-1" style={{ fontSize: '0.7rem', letterSpacing: '0.05em' }}>Highest Score</div>
            <div className="fs-4 fw-bold text-primary">{highestScore} Coins</div>
          </div>
        </div>
        <div className="col-12 col-md-4">
          <div className="card border-0 text-center py-3">
            <div className="fs-3 mb-1">👥</div>
            <div className="text-muted small text-uppercase fw-bold mb-1" style={{ fontSize: '0.7rem', letterSpacing: '0.05em' }}>Registered Players</div>
            <div className="fs-4 fw-bold text-dark">{registeredPlayers}</div>
          </div>
        </div>
        <div className="col-12 col-md-4">
          <div className="card border-0 text-center py-3">
            <div className="fs-3 mb-1">🎮</div>
            <div className="text-muted small text-uppercase fw-bold mb-1" style={{ fontSize: '0.7rem', letterSpacing: '0.05em' }}>Completed Games</div>
            <div className="fs-4 fw-bold text-success">{completedGames}</div>
          </div>
        </div>
      </div>
 
      {/* Leaderboard Card */}
      <div className="card border-0 overflow-hidden mx-auto shadow-sm" style={{ maxWidth: '650px' }}>
        <div className="card-body p-0">
          <Table hover responsive className="mb-0 align-middle text-center">
            <thead>
              <tr style={{ fontSize: '0.8rem' }} className="text-uppercase text-muted tracking-wider fw-bold">
                <th className="py-3" style={{ width: '90px' }}>Rank</th>
                <th className="py-3 text-start">Player</th>
                <th className="py-3" style={{ width: '180px' }}>Best Score</th>
              </tr>
            </thead>
            <tbody>
              {ranking.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-center text-muted py-4">
                    No completed games yet.
                  </td>
                </tr>
              ) : (
                ranking.map((row, index) => {
                  const isCurrentUser = user && row.username === user.username;
                  
                  let rankDisplay;
                  let rowClass = "";
                  
                  if (index === 0) {
                    rankDisplay = <span className="fs-5">🥇</span>;
                    rowClass = "leaderboard-row-0";
                  } else if (index === 1) {
                    rankDisplay = <span className="fs-5">🥈</span>;
                    rowClass = "leaderboard-row-1";
                  } else if (index === 2) {
                    rankDisplay = <span className="fs-5">🥉</span>;
                    rowClass = "leaderboard-row-2";
                  } else {
                    rankDisplay = <span className="fw-bold text-muted">#{index + 1}</span>;
                  }
 
                  if (isCurrentUser) {
                    rowClass += " active-user-row";
                  }
 
                  return (
                    <tr
                      key={row.username}
                      className={rowClass}
                      style={{
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <td className="py-3">{rankDisplay}</td>
                      <td className="py-3 text-start">
                        <span className={isCurrentUser ? "text-primary fw-bold" : "text-dark fw-semibold"}>
                          {row.username}
                        </span>
                        {isCurrentUser && (
                          <span className="badge bg-primary ms-2 align-middle text-uppercase" style={{ fontSize: '0.65rem' }}>
                            You
                          </span>
                        )}
                      </td>
                      <td className="py-3">
                        <span className="badge bg-secondary text-dark border px-3 py-2 fw-bold" style={{ fontSize: '0.85rem' }}>
                          🪙 {row.best_score}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        </div>
      </div>
 
      {/* Play Again Controls */}
      <div className="text-center mt-4">
        <Link to="/play" className="btn btn-primary btn-lg shadow-sm px-5">
          🎮 Play Game
        </Link>
      </div>
    </div>
  );
}
