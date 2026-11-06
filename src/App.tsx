import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { SessionProvider, useSession } from './session';
import Onboard from './screens/Onboard';
import WalletScreen from './screens/Wallet';
import CreateGroup from './screens/CreateGroup';
import JoinGroup from './screens/JoinGroup';
import Group from './screens/Group';

function Routed() {
  const { session, error } = useSession();
  if (error) return <p className="p-8 text-danger">{error}</p>;
  if (!session) return <Onboard />;
  return (
    <Routes>
      <Route path="/" element={<WalletScreen />} />
      <Route path="/create" element={<CreateGroup />} />
      <Route path="/join" element={<JoinGroup />} />
      <Route path="/join/:groupId" element={<JoinGroup />} />
      <Route path="/group/:groupId" element={<Group />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Routed />
      </SessionProvider>
    </BrowserRouter>
  );
}
