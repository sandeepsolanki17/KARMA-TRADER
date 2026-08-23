import { createClerkClient } from '@clerk/backend';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '.env' });

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

async function checkInvitations() {
  try {
    const response = await clerk.invitations.getInvitationList();
    const invitations = response.data;
    if (invitations.length === 0) {
      console.log('No pending invitations found.');
    } else {
      console.log('Pending invitations:');
      for (const inv of invitations) {
        console.log(`- ${inv.emailAddress}: ${inv.url}`);
      }
    }
    process.exit(0);
  } catch (err) {
    console.error('Error fetching invitations:', err);
    process.exit(1);
  }
}

checkInvitations();
