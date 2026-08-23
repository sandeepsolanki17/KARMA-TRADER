import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/globals.css';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
const clerkConfigured = Boolean(PUBLISHABLE_KEY) && !PUBLISHABLE_KEY?.includes('REPLACE_ME');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

function Root() {
  const app = (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App clerkConfigured={clerkConfigured} />
      </BrowserRouter>
    </QueryClientProvider>
  );

  // Without a real Clerk key, ClerkProvider itself throws — render the app
  // in an unauthenticated shell that clearly explains what's missing rather
  // than crashing to a blank white screen.
  if (!clerkConfigured) return app;

  return <ClerkProvider publishableKey={PUBLISHABLE_KEY!}>{app}</ClerkProvider>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
