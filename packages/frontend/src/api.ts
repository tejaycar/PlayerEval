const API_BASE = '/api';

// Version tracking: built-in version vs what the server reports
declare const __APP_VERSION__: string;
const BUILD_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
let serverVersion: string | null = null;
let versionMismatchDetected = false;

export function isVersionMismatch(): boolean {
  return versionMismatchDetected;
}

// Listeners for version mismatch events
type VersionMismatchListener = () => void;
const versionListeners: VersionMismatchListener[] = [];
export function onVersionMismatch(listener: VersionMismatchListener): () => void {
  versionListeners.push(listener);
  return () => {
    const idx = versionListeners.indexOf(listener);
    if (idx >= 0) versionListeners.splice(idx, 1);
  };
}

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
  // Normalize: backend returns coach.id but we store as coachId
  const normalized = { ...user };
  if (normalized.id && !normalized.coachId) {
    normalized.coachId = normalized.id;
    delete normalized.id;
  }
  localStorage.setItem('playereval_user', JSON.stringify(normalized));
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

  // Check for version mismatch
  const reportedVersion = res.headers.get('X-App-Version');
  if (reportedVersion && BUILD_VERSION !== 'dev' && reportedVersion !== 'dev' && reportedVersion !== BUILD_VERSION) {
    if (!versionMismatchDetected) {
      versionMismatchDetected = true;
      serverVersion = reportedVersion;
      versionListeners.forEach((fn) => fn());
    }
  }

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
  login: (email: string, pin: string, teamName: string, inviteCode?: string) => request('POST', '/auth/login', { email, pin, teamName, inviteCode: inviteCode || undefined }),
  changePin: (currentPin: string, newPin: string) => request('POST', '/auth/change-pin', { currentPin, newPin }),
};

// Team
export const team = {
  get: () => request('GET', '/team'),
  create: (name: string) => request('POST', '/team', { name }),
  getExcludedCoaches: () => request('GET', '/team/excluded-coaches'),
  saveExcludedCoaches: (excludedCoachIds: string[]) => request('PUT', '/team/excluded-coaches', { excludedCoachIds }),
  getExcludedRatings: () => request('GET', '/team/excluded-ratings'),
  saveExcludedRatings: (excludedRatings: Array<{coachId: string, playerId: string}>) => request('PUT', '/team/excluded-ratings', { excludedRatings }),
  getExclusionMode: () => request('GET', '/team/exclusion-mode'),
  saveExclusionMode: (exclusionMode: string) => request('PUT', '/team/exclusion-mode', { exclusionMode }),
  getSettings: () => request('GET', '/team/settings'),
  saveSettings: (settings: { coachResultsVisible?: boolean; coachAnalysisVisible?: boolean }) => request('PUT', '/team/settings', settings),
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
  analysis: (excludedCoachIds?: string[], excludedRatings?: Array<{coachId: string, playerId: string}>, leadView?: boolean) => request('POST', '/evaluations/analysis', { excludedCoachIds: excludedCoachIds || [], excludedRatings: excludedRatings || [], ...(leadView ? { leadView: true } : {}) }),
};

// My Players (coach view)
export const myPlayers = {
  list: () => request('GET', '/my-players'),
};
