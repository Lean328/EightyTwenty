import { distanceKm, nearestFirst } from '@/services/integrations/geo';

const braddon = { id: 'braddon', coords: { latitude: -35.273621, longitude: 149.133004 } };
const greenway = { id: 'greenway', coords: { latitude: -35.423192, longitude: 149.073368 } };
const kingston = { id: 'kingston', coords: { latitude: -35.31468, longitude: 149.139865 } };
const akuna = { id: 'akuna', coords: null };

describe('nearest café', () => {
  it('measures great-circle distance', () => {
    expect(distanceKm(braddon.coords, greenway.coords)).toBeCloseTo(17.6, 0);
    expect(distanceKm(braddon.coords, braddon.coords)).toBe(0);
  });

  it('puts the nearest café first and cafés without a position last', () => {
    const tuggeranong = { latitude: -35.42, longitude: 149.07 };
    expect(nearestFirst([akuna, braddon, kingston, greenway], tuggeranong).map((c) => c.id)).toEqual(['greenway', 'kingston', 'braddon', 'akuna']);
    expect(nearestFirst([akuna, braddon], null).map((c) => c.id)).toEqual(['akuna', 'braddon']);
  });
});
