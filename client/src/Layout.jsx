import { useState, useEffect } from 'react';
import { Container, Nav, Navbar, NavDropdown } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = (e) => {
    e.preventDefault();
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const handleNavClick = (e, to) => {
    e.preventDefault();
    if (window.location.pathname === '/play' && window.isGameActive) {
      const confirmLeave = window.confirm(
        "You have an active game in progress. Leaving now will forfeit your game. Are you sure you want to leave?"
      );
      if (!confirmLeave) {
        return;
      }
      window.isGameActive = false;
    }
    navigate(to);
  };

  const handleLogout = async (e) => {
    e.preventDefault();
    if (window.location.pathname === '/play' && window.isGameActive) {
      const confirmLeave = window.confirm(
        "You have an active game in progress. Leaving now will forfeit your game. Are you sure you want to leave?"
      );
      if (!confirmLeave) {
        return;
      }
      window.isGameActive = false;
    }
    await logout();
    navigate('/');
  };

  return (
    <>
      <Navbar variant="light" expand="lg" sticky="top" className="mb-4 navbar-custom">
        <Container>
          <Navbar.Brand href="/" onClick={(e) => handleNavClick(e, '/')} className="navbar-logo-text">
            Last Race
          </Navbar.Brand>
          <Navbar.Toggle aria-controls="basic-navbar-nav" />
          <Navbar.Collapse id="basic-navbar-nav">
            <Nav className="me-auto align-items-center">
              <NavDropdown title="☰ Menu" id="nav-menu-dropdown" className="menu-dropdown-custom ms-lg-4">
                <NavDropdown.Item href="/" onClick={(e) => handleNavClick(e, '/')} active={window.location.pathname === '/'}>
                  📖 Instructions
                </NavDropdown.Item>
                {user && (
                  <NavDropdown.Item href="/play" onClick={(e) => handleNavClick(e, '/play')} active={window.location.pathname === '/play'}>
                    🎮 Play Game
                  </NavDropdown.Item>
                )}
                {user && (
                  <NavDropdown.Item href="/leaderboard" onClick={(e) => handleNavClick(e, '/leaderboard')} active={window.location.pathname === '/leaderboard'}>
                    🏆 Ranking
                  </NavDropdown.Item>
                )}
              </NavDropdown>
            </Nav>
            <Nav className="align-items-center mt-3 mt-lg-0">
              <Nav.Link onClick={toggleTheme} className="theme-toggle-btn me-lg-3 mb-2 mb-lg-0">
                {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
              </Nav.Link>
              {user ? (
                <NavDropdown title={`👤 ${user.username}`} id="user-menu-dropdown" className="user-dropdown-custom">
                  <NavDropdown.Item onClick={handleLogout}>
                    🚪 Logout
                  </NavDropdown.Item>
                </NavDropdown>
              ) : (
                <Nav.Link href="/login" onClick={(e) => handleNavClick(e, '/login')} className="btn-login-navbar">
                  🔑 Login
                </Nav.Link>
              )}
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>
      <Container className="pb-5">{children}</Container>
    </>
  );
}
