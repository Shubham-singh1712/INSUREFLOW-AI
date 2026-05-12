import { cookies } from 'next/headers';

export const WORKFLOW_SETTINGS_COOKIE = 'insureflowai_workflow_settings';

export type WorkflowSettings = {
  aiThreshold: number;
  maxUploadMb: number;
  signatureDetection: boolean;
  blurDetection: boolean;
  cloudinaryStorage: boolean;
  jwtSessionDays: number;
};

export const defaultWorkflowSettings: WorkflowSettings = {
  aiThreshold: 85,
  maxUploadMb: 20,
  signatureDetection: true,
  blurDetection: true,
  cloudinaryStorage: true,
  jwtSessionDays: 7,
};

const clampNumber = (value: unknown, min: number, max: number, fallback: number) => {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numberValue)));
};

export const normalizeWorkflowSettings = (value: Partial<WorkflowSettings> | null | undefined): WorkflowSettings => ({
  aiThreshold: clampNumber(value?.aiThreshold, 1, 100, defaultWorkflowSettings.aiThreshold),
  maxUploadMb: clampNumber(value?.maxUploadMb, 1, 100, defaultWorkflowSettings.maxUploadMb),
  signatureDetection: typeof value?.signatureDetection === 'boolean' ? value.signatureDetection : defaultWorkflowSettings.signatureDetection,
  blurDetection: typeof value?.blurDetection === 'boolean' ? value.blurDetection : defaultWorkflowSettings.blurDetection,
  cloudinaryStorage: typeof value?.cloudinaryStorage === 'boolean' ? value.cloudinaryStorage : defaultWorkflowSettings.cloudinaryStorage,
  jwtSessionDays: clampNumber(value?.jwtSessionDays, 1, 30, defaultWorkflowSettings.jwtSessionDays),
});

export async function getWorkflowSettings() {
  const cookieStore = await cookies();
  const rawSettings = cookieStore.get(WORKFLOW_SETTINGS_COOKIE)?.value;

  if (!rawSettings) return defaultWorkflowSettings;

  try {
    return normalizeWorkflowSettings(JSON.parse(rawSettings));
  } catch {
    return defaultWorkflowSettings;
  }
}
