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
import { OrganizationSetupPage } from './routes/OrganizationSetupPage';
import { setTokenGetter, api } from './lib/api';
import { useQuery } from '@tanstack/react-query';

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

function OrgGuard() {
  const { data, isLoading } = useQuery({
    queryKey: ['current-org'],
    queryFn: async () => {
      const res = await api.get('/admin/organization');
      return res.data.organization as { id: string; name: string } | null;
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (data === null) {
    return <OrganizationSetupPage />;
  }

  return <AuthedLayout />;
}

export default function App({ clerkConfigured }: { clerkConfigured: boolean }) {
  if (!clerkConfigured) return <ConfigMissingScreen />;

  return (
    <>
      <SignedIn>
        <TokenBridge />
        <OrgGuard />
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
