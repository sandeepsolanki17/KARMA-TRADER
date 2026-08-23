import { Slot, useRouter } from 'expo-router';
import { ClerkProvider } from '@clerk/clerk-expo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { tokenCache } from '../src/lib/tokenCache';

const PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
export const clerkConfigured = Boolean(PUBLISHABLE_KEY) && !PUBLISHABLE_KEY?.includes('REPLACE_ME');

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1 } },
});

export default function RootLayout() {
  const router = useRouter();

  const content = (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <Slot />
    </QueryClientProvider>
  );

  if (!clerkConfigured) return content;

  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY!}
      tokenCache={tokenCache}
      navigate={(to) => {
        router.replace(to as any);
      }}
    >
      {content}
    </ClerkProvider>
  );
}
