import { createClerkClient } from '@clerk/backend';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: '.env' });

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function makeAdmin() {
  try {
    const response = await clerk.users.getUserList();
    const users = response.data;
    
    if (users.length === 0) {
      console.log('No users found in Clerk.');
      process.exit(1);
    }
    
    const user = users[0];
    const email = user.emailAddresses[0]?.emailAddress || 'unknown';
    console.log(`Found user: ${email} (${user.id})`);
    
    // Check if already in DB
    const { rows } = await pool.query('SELECT * FROM users WHERE clerk_user_id = $1', [user.id]);
    if (rows.length > 0) {
      // Update to ADMIN
      await pool.query('UPDATE users SET role = $1 WHERE clerk_user_id = $2', ['ADMIN', user.id]);
      console.log(`User ${email} updated to ADMIN in local DB.`);
    } else {
      // Insert as ADMIN
      await pool.query(
        `INSERT INTO users (clerk_user_id, role, status) VALUES ($1, 'ADMIN', 'ACTIVE')`,
        [user.id]
      );
      console.log(`User ${email} created as ADMIN in local DB.`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Failed to make admin:', error);
    process.exit(1);
  }
}

makeAdmin();
