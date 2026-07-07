// api/db.ts
import { createClient } from '@libsql/client';

export const getDb = () => {
  return createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });
};