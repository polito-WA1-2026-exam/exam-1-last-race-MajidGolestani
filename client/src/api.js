const API_BASE = 'http://localhost:3001/api';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed');
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  login: (username, password) =>
    request('/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request('/logout', { method: 'POST' }),
  session: () => request('/session'),
  network: () => request('/network'),
  events: () => request('/events'),
  leaderboard: () => request('/leaderboard'),
  createGame: () => request('/games', { method: 'POST' }),
  getGame: (id) => request(`/games/${id}`),
  startPlanning: (id) => request(`/games/${id}/planning`, { method: 'POST' }),
  submitRoute: (id, route) =>
    request(`/games/${id}/route`, {
      method: 'PUT',
      body: JSON.stringify({ route }),
    }),
  timeoutRoute: (id, route) =>
    request(`/games/${id}/timeout`, {
      method: 'POST',
      body: JSON.stringify({ route }),
    }),
};
