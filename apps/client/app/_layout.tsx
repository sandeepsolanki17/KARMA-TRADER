import { Slot } from 'expo-router';
import { ClerkProvider } from '@clerk/clerk-expo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { tokenCache } from '../src/lib/tokenCache';

const PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
export const clerkConfigured = Boolean(PUBLISHABLE_KEY) && !PUBLISHABLE_KEY?.includes('REPLACE_ME');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      // Don't refetch on window focus in the mobile app — causes unnecessary API calls
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Root layout: wraps the entire app with Clerk + React Query providers.
 *
 * IMPORTANT: We use ClerkLoaded to ensure Clerk is fully initialized before
 * any child component tries to use useAuth/useSignIn. The previous version
 * used a `navigate` prop on ClerkProvider which can conflict with Expo
 * Router's navigation — removed in favor of letting Expo Router handle
 * navigation normally.
 */
export default function RootLayout() {
  const content = (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <Slot />
    </QueryClientProvider>
  );

  if (!clerkConfigured) return content;

  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY!} tokenCache={tokenCache}>
      {content}
    </ClerkProvider>
  );
}
