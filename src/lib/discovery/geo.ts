import type { Bounds } from "./types";

export function distanceMetres(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const radians = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * radians;
  const dLon = (b.longitude - a.longitude) * radians;
  const lat1 = a.latitude * radians;
  const lat2 = b.latitude * radians;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function bearingDegrees(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const radians = Math.PI / 180;
  const lat1 = a.latitude * radians;
  const lat2 = b.latitude * radians;
  const dLon = (b.longitude - a.longitude) * radians;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) / radians + 360) % 360;
}

export function angularDifference(a: number, b: number) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

export function limitedBounds(bounds: Bounds, latitude: number, longitude: number): Bounds {
  // A neighbourhood-sized pilot keeps provider queries bounded.
  const latHalf = Math.min((bounds.north - bounds.south) / 2, 0.002);
  const lonHalf = Math.min((bounds.east - bounds.west) / 2, 0.004);
  return { south: latitude - latHalf, north: latitude + latHalf, west: longitude - lonHalf, east: longitude + lonHalf };
}
