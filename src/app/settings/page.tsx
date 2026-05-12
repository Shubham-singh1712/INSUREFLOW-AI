import React from 'react';
import SettingsForm from './components/SettingsForm';
import { getWorkflowSettings } from '@/lib/workflowSettings';

export default async function SettingsPage() {
  return <SettingsForm initialSettings={await getWorkflowSettings()} />;
}
