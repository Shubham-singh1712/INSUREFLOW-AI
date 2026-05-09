import React from 'react';
import AppLayout from '@/components/AppLayout';
import ClaimIntakeFlow from './components/ClaimIntakeFlow';

export default function ClaimIntakePage() {
  return (
    <AppLayout currentPath="/claim-intake-document-upload">
      <ClaimIntakeFlow />
    </AppLayout>
  );
}