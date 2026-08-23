import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { SignedIn, SignedOut, useAuth } from '@clerk/clerk-react';
import { Sidebar, TickerRail } from './components/Sidebar';
import { ConfigMissingScreen } from './components/ConfigMissingScreen';
import { SignInPage } from './routes/SignInPage';
import { DashboardPage } from './routes/DashboardPage';
import { SignalsListPage } from './routes/SignalsListPage';
import { NewSignalPage } from './routes/NewSignalPage';
import { SignalDetailPage } from './routes/SignalDetailPage';
import { ClientsListPage } from './routes/ClientsListPage';
import { ClientDetailPage } from './routes/ClientDetailPage';
import { AuditPage } from './routes/AuditPage';
import { SystemHealthPage } from './routes/SystemHealthPage';
import { setTokenGetter } from './lib/api';

function TokenBridge() {
  const { getToken } = useAuth();
  useEffect(() => {
    setTokenGetter(() => getToken());
  }, [getToken]);
  return null;
}

function AuthedLayout() {
  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 min-h-screen p-6 flex flex-col gap-5">
        <TickerRail />
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/signals" element={<SignalsListPage />} />
          <Route path="/signals/new" element={<NewSignalPage />} />
          <Route path="/signals/:signalId" element={<SignalDetailPage />} />
          <Route path="/clients" element={<ClientsListPage />} />
          <Route path="/clients/:clientId" element={<ClientDetailPage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/health" element={<SystemHealthPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App({ clerkConfigured }: { clerkConfigured: boolean }) {
  if (!clerkConfigured) return <ConfigMissingScreen />;

  return (
    <>
      <SignedIn>
        <TokenBridge />
        <AuthedLayout />
      </SignedIn>
      <SignedOut>
        <Routes>
          <Route path="/sign-in/*" element={<SignInPage />} />
          <Route path="*" element={<Navigate to="/sign-in" replace />} />
        </Routes>
      </SignedOut>
    </>
  );
}
