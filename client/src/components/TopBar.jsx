import { useNavigate } from 'react-router-dom';
import { api, auth } from '../lib/api';
import { Brand } from './ui';
import { IconLogout } from './icons';

const initials = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('') || '?';

export default function TopBar({ children }) {
  const navigate = useNavigate();
  const logout = async () => {
    try {
      await api('POST', '/auth/logout');
    } catch {
      /* ignore */
    }
    auth.clear();
    navigate('/login', { replace: true });
  };
  const name = auth.user?.name || '';
  return (
    <header className="topbar">
      <Brand />
      <div className="grow row">{children}</div>
      <span className="topbar-user">
        <span className="topbar-avatar" aria-hidden="true">{initials(name)}</span>
        <span className="topbar-name">{name}</span>
      </span>
      <button className="btn sm ghost" onClick={logout}>
        <IconLogout size={14} /> Log out
      </button>
    </header>
  );
}
