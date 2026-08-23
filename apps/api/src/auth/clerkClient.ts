import { createClerkClient } from '@clerk/backend';
import { env } from '../config/env.js';

export const clerkClient = createClerkClient({
  secretKey: env.CLERK_SECRET_KEY,
  publishableKey: env.CLERK_PUBLISHABLE_KEY,
});
