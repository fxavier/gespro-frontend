import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      tenantId: string;
      permissions: string[];
    } & DefaultSession['user'];
  }

  interface User {
    tenantId: string;
    permissions: string[];
    permsVersion?: number;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    uid: string;
    tenantId: string;
    permissions: string[];
    permsVersion?: number;
  }
}
