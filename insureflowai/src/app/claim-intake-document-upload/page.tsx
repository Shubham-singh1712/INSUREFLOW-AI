import React, { Suspense } from 'react';
import AppLayout from '@/components/AppLayout';
import ClaimIntakeFlow from './components/ClaimIntakeFlow';

export default function ClaimIntakePage() {
  return (
    <AppLayout currentPath="/claim-intake-document-upload">
      <Suspense
        fallback={
          <div className="card p-6 text-sm text-muted-foreground">Loading claim intake...</div>
        }
      >
        <ClaimIntakeFlow />
      </Suspense>
    </AppLayout>
  );
}
