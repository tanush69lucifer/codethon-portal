import { useNavigate } from 'react-router-dom';
import { api, auth } from '../lib/api';
import { Brand } from './ui';

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
  return (
    <header className="topbar">
      <Brand />
      <div className="grow row">{children}</div>
      <span className="muted small">{auth.user?.name}</span>
      <button className="btn sm" onClick={logout}>
        Log out
      </button>
    </header>
  );
}
