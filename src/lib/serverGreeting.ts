export const APP_TIME_ZONE = 'Asia/Kolkata';

export const getServerHour = (date = new Date(), timeZone = APP_TIME_ZONE) => {
  const hour = new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    hour12: false,
    timeZone,
  }).format(date);

  return Number(hour);
};

export const getTimeOfDayGreeting = (date = new Date(), timeZone = APP_TIME_ZONE) => {
  const hour = getServerHour(date, timeZone);

  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Good night';
};

export const getUserDisplayName = (
  user: { email?: string; user_metadata?: Record<string, unknown> } | null | undefined
) => {
  const metadata = user?.user_metadata || {};
  const metadataName = metadata.full_name || metadata.name || metadata.display_name;

  if (typeof metadataName === 'string' && metadataName.trim()) {
    return metadataName.trim();
  }

  return user?.email?.split('@')[0] || 'User';
};
