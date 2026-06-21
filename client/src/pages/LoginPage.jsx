import { useEffect, useState } from 'react';
import { Alert, Button, Form } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) navigate('/play', { replace: true });
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(username.trim(), password);
      navigate('/play');
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="d-flex justify-content-center align-items-center py-5">
      <div 
        className="card border-0 p-4" 
        style={{ 
          width: '100%', 
          maxWidth: '440px'
        }}
      >
        <div className="card-body">
          {/* Game Identity */}
          <div className="text-center mb-4">
            <h2 className="fw-bold mb-1" style={{ fontSize: '1.8rem', color: 'var(--text-heading)' }}>
              Last Race
            </h2>
            <p className="text-muted small">Metro Memorization Challenge — Student Access</p>
          </div>
 
          {/* Info Box */}
          <Alert 
            variant="info" 
            className="mb-4 small py-2 px-3" 
          >
            <div className="text-center mb-2">
              🔑 Click to auto-fill a user account:
            </div>
            <div className="d-flex flex-column align-items-center gap-1">
              <Button 
                variant="link" 
                className="p-0 text-decoration-none font-monospace text-primary text-center" 
                onClick={() => { setUsername('marco'); setPassword('metro2026!'); }}
                style={{ fontSize: '0.85rem' }}
              >
                👤 marco / 🔑 metro2026!
              </Button>
              <Button 
                variant="link" 
                className="p-0 text-decoration-none font-monospace text-primary text-center" 
                onClick={() => { setUsername('majid'); setPassword('MjQ11@'); }}
                style={{ fontSize: '0.85rem' }}
              >
                👤 majid / 🔑 MjQ11@
              </Button>
            </div>
          </Alert>
 
          {error && (
            <Alert variant="danger" className="py-2 px-3 small text-center mb-3">
              ❌ {error}
            </Alert>
          )}
 
          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3">
              <Form.Label className="form-label">Username</Form.Label>
              <Form.Control
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                placeholder="e.g. marco"
              />
            </Form.Group>
 
            <Form.Group className="mb-4">
              <Form.Label className="form-label">Password</Form.Label>
              <Form.Control
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="Enter your password"
              />
            </Form.Group>
 
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-100 py-3 fw-bold text-uppercase tracking-wider shadow-sm d-flex align-items-center justify-content-center"
              disabled={submitting}
            >
              {submitting ? (
                'Authenticating…'
              ) : (
                <>
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    width="18" 
                    height="18" 
                    fill="currentColor" 
                    className="me-2" 
                    viewBox="0 0 16 16"
                  >
                    <path d="M8 1a2 2 0 0 1 2 2v4H6V3a2 2 0 0 1 2-2zm3 6V3a3 3 0 0 0-6 0v4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/>
                  </svg>
                  Log In
                </>
              )}
            </Button>
          </Form>
        </div>
      </div>
    </div>
  );
}
