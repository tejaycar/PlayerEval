const API_BASE = '/api';

let authToken: string | null = localStorage.getItem('playereval_token');

export function setToken(token: string) {
  authToken = token;
  localStorage.setItem('playereval_token', token);
}

export function getToken(): string | null {
  return authToken;
}

export function clearToken() {
  authToken = null;
  localStorage.removeItem('playereval_token');
}

export function getStoredUser(): { coachId: string; teamId: string; email: string; isLead: boolean; name: string } | null {
  const stored = localStorage.getItem('playereval_user');
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export function setStoredUser(user: any) {
  localStorage.setItem('playereval_user', JSON.stringify(user));
}

export function clearStoredUser() {
  localStorage.removeItem('playereval_user');
}

async function request(method: string, path: string, body?: any): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    clearToken();
    clearStoredUser();
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

// Auth
export const auth = {
  login: (email: string, pin: string, inviteCode?: string, teamId?: string) => request('POST', '/auth/login', { email, pin, inviteCode: inviteCode || undefined, teamId: teamId || undefined }),
  changePin: (currentPin: string, newPin: string) => request('POST', '/auth/change-pin', { currentPin, newPin }),
};

// Team
export const team = {
  get: () => request('GET', '/team'),
  create: (name: string) => request('POST', '/team', { name }),
};

// Players
export const players = {
  list: () => request('GET', '/players'),
  create: (player: any) => request('POST', '/players', player),
  upload: (players: any[]) => request('POST', '/players/upload', { players }),
  update: (id: string, data: any) => request('PUT', `/players/${id}`, data),
  delete: (id: string) => request('DELETE', `/players/${id}`),
};

// Coaches
export const coaches = {
  list: () => request('GET', '/coaches'),
  create: (coach: any) => request('POST', '/coaches', coach),
  upload: (coaches: any[]) => request('POST', '/coaches/upload', { coaches }),
  update: (id: string, data: any) => request('PUT', `/coaches/${id}`, data),
  delete: (id: string) => request('DELETE', `/coaches/${id}`),
  getInviteLink: () => request('GET', '/coaches/invite-link'),
  resetPin: (id: string) => request('POST', `/coaches/${id}/reset-pin`),
};

// Assignments
export const assignments = {
  list: () => request('GET', '/assignments'),
  autoAssign: () => request('POST', '/assignments/auto'),
  add: (coachId: string, playerId: string) => request('POST', '/assignments', { coachId, playerId }),
  remove: (coachId: string, playerId: string) => request('DELETE', `/assignments/${coachId}/${playerId}`),
  clearAll: () => request('DELETE', '/assignments'),
};

// Evaluations
export const evaluations = {
  list: () => request('GET', '/evaluations'),
  summary: () => request('GET', '/evaluations/summary'),
  playerDetail: (playerId: string) => request('GET', `/evaluations/player/${playerId}`),
  submit: (data: any) => request('POST', '/evaluations', data),
};

// My Players (coach view)
export const myPlayers = {
  list: () => request('GET', '/my-players'),
};
