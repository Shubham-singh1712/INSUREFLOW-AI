/* eslint-disable no-control-regex */
export const clamp = (value: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, Math.round(value)));

export const normalizeWhitespace = (value = '') =>
  value
    .replace(/\u0000/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export const normalizeForEntityMatching = (value = '') =>
  normalizeWhitespace(value)
    .replace(/(^|[^A-Za-z0-9])pt\.?(?=\s|$)/gi, '$1patient')
    .replace(/[^\S\r\n]{2,}/g, ' ');

export const cleanValue = (value = '') =>
  normalizeWhitespace(value)
    .replace(/^[\s:;|,\-_]+|[\s:;|,\-_]+$/g, '')
    .replace(/\s+([,.:;])/g, '$1');

export const toGlobalRegex = (regex: RegExp) => {
  regex.lastIndex = 0;
  return regex.global ? regex : new RegExp(regex.source, `${regex.flags}g`);
};

export const capturedValue = (match: RegExpMatchArray) =>
  [...match]
    .slice(1)
    .reverse()
    .find((value) => value !== undefined && value.trim().length > 0) || match[0];

export const createId = (prefix: string) => {
  const uuid = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : '';
  return `${prefix}-${uuid || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
};

export const parseMoney = (value: string) => {
  const parsed = Number.parseFloat(value.replace(/[^\d.]/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const monthIndex = (value: string) => {
  const key = value.toLowerCase().slice(0, 3);
  const month = [
    'jan',
    'feb',
    'mar',
    'apr',
    'may',
    'jun',
    'jul',
    'aug',
    'sep',
    'oct',
    'nov',
    'dec',
  ].indexOf(key);
  return month >= 0 ? String(month + 1).padStart(2, '0') : null;
};

const normalizeYear = (value: string) => (value.length === 2 ? `20${value}` : value);

export const normalizeDate = (value: string) => {
  const cleaned = cleanValue(value);
  const iso = cleaned.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;

  const parts = cleaned.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (parts) {
    return `${normalizeYear(parts[3])}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  }

  const dayMonthName = cleaned.match(/^(\d{1,2})\s*([A-Za-z]{3,9})\s*(\d{2,4})$/);
  if (dayMonthName) {
    const month = monthIndex(dayMonthName[2]);
    return month
      ? `${normalizeYear(dayMonthName[3])}-${month}-${dayMonthName[1].padStart(2, '0')}`
      : cleaned || null;
  }

  const monthNameDay = cleaned.match(/^([A-Za-z]{3,9})\s*(\d{1,2}),?\s*(\d{2,4})$/);
  if (monthNameDay) {
    const month = monthIndex(monthNameDay[1]);
    return month
      ? `${normalizeYear(monthNameDay[3])}-${month}-${monthNameDay[2].padStart(2, '0')}`
      : cleaned || null;
  }

  return cleaned || null;
};

export const daysBetween = (from?: string | null, to?: string | null) => {
  if (!from || !to) return null;
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
};

export const textFingerprint = (text: string) =>
  cleanValue(text.toLowerCase()).replace(/\d+/g, '#').slice(0, 900);
