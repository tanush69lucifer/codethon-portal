import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { auth } from './lib/api';
import { Loading, useToast } from './components/ui';
import Login from './pages/Login';
import CandidateHome from './pages/candidate/CandidateHome';
import Lobby from './pages/candidate/Lobby';

// Heavy pages (Monaco editor, admin tables) load on demand.
const Exam = lazy(() => import('./pages/candidate/Exam'));
const AdminHome = lazy(() => import('./pages/admin/AdminHome'));
const ContestAdmin = lazy(() => import('./pages/admin/ContestAdmin'));

function useUser() {
  const [user, setUser] = useState(auth.user);
  useEffect(() => auth.subscribe(setUser), []);
  return user;
}

function Guard({ role, children }) {
  const user = useUser();
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const user = useUser();
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    const onLogout = (e) => {
      if (e.detail?.code === 'SESSION_REPLACED') toast(e.detail.message, 'bad');
      navigate('/login', { replace: true });
    };
    window.addEventListener('cp:logout', onLogout);
    return () => window.removeEventListener('cp:logout', onLogout);
  }, [navigate, toast]);

  const home = !user ? '/login' : user.role === 'ADMIN' ? '/admin' : '/home';

  return (
    <Suspense fallback={<div className="page"><Loading /></div>}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to={home} replace /> : <Login />} />
        <Route path="/home" element={<Guard role="CANDIDATE"><CandidateHome /></Guard>} />
        <Route path="/contest/:contestId" element={<Guard role="CANDIDATE"><Lobby /></Guard>} />
        <Route path="/contest/:contestId/exam" element={<Guard role="CANDIDATE"><Exam /></Guard>} />
        <Route path="/admin" element={<Guard role="ADMIN"><AdminHome /></Guard>} />
        <Route path="/admin/contest/:contestId" element={<Guard role="ADMIN"><ContestAdmin /></Guard>} />
        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
    </Suspense>
  );
}
