export const hasGoogleKey = () => Boolean(process.env.GOOGLE_MAPS_API_KEY);

export function googleApiKey() {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY is not configured. Add it to .env.local and restart the server.");
  return key;
}
