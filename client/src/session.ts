export interface Session {
  roomCode: string;
  token: string;
  nickname: string;
}

const SESSION_KEY = 'mahjong.session';
const NICKNAME_KEY = 'mahjong.nickname';

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (typeof s.roomCode !== 'string' || typeof s.token !== 'string') return null;
    return s;
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  localStorage.setItem(NICKNAME_KEY, session.nickname);
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

export function loadNickname(): string {
  return localStorage.getItem(NICKNAME_KEY) ?? '';
}
