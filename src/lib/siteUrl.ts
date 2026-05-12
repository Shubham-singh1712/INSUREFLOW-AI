const DEFAULT_SITE_URL = 'https://insureflow-ai-lbge.vercel.app';

export const getSiteOrigin = () => {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || DEFAULT_SITE_URL;

  try {
    return new URL(siteUrl).origin;
  } catch {
    return DEFAULT_SITE_URL;
  }
};
