import { cookies } from 'next/headers';

export const DEMO_MODE_COOKIE = 'insureflowai_demo_mode';

export type DemoModeState = {
  enabled: boolean;
  hasLiveProvider: boolean;
  provider: 'openrouter' | 'openai' | 'gemini' | 'local_ocr';
  providerLabel: string;
  isManualOverride: boolean;
};

export const getLiveProvider = (): DemoModeState['provider'] => {
  if (process.env.OPENROUTER_API_KEY) return 'openrouter';
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  return 'local_ocr';
};

export const getProviderLabel = (provider: DemoModeState['provider']) => {
  if (provider === 'openrouter') return 'OpenRouter';
  if (provider === 'openai') return 'OpenAI';
  if (provider === 'gemini') return 'Gemini';
  return 'Local OCR extraction';
};

export async function getDemoModeState(): Promise<DemoModeState> {
  const provider = getLiveProvider();
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(DEMO_MODE_COOKIE)?.value;
  const isManualOverride = cookieValue === 'on' || cookieValue === 'off';

  const envDemo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

  return {
    enabled: isManualOverride ? cookieValue === 'on' : envDemo,
    hasLiveProvider: true,
    provider,
    providerLabel: getProviderLabel(provider),
    isManualOverride,
  };
}
