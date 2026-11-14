import type { ReactNode } from 'react';
// Simulated local role; this is not production authentication.
export default function AuthGate({children}: {children: ReactNode}) { return <>{children}</>; }
