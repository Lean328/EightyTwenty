import { resolveDevApiUrl } from '@/constants/config';

describe('resolveDevApiUrl', () => {
  const local = 'http://127.0.0.1:8000/api/v1/app';

  it('points a phone at the computer Metro runs on', () => {
    expect(resolveDevApiUrl(local, 'ios', '192.168.1.18:8081')).toBe('http://192.168.1.18:8000/api/v1/app');
    expect(resolveDevApiUrl('http://localhost:8000/api/v1/app', 'android', '10.0.0.5:8081')).toBe('http://10.0.0.5:8000/api/v1/app');
  });

  it('leaves the web build, tunnels, missing hosts and real URLs alone', () => {
    expect(resolveDevApiUrl(local, 'web', '192.168.1.18:8081')).toBe(local);
    expect(resolveDevApiUrl(local, 'ios', 'abc-anonymous-8081.exp.direct')).toBe(local);
    expect(resolveDevApiUrl(local, 'ios', null)).toBe(local);
    const prod = 'https://eightytwenty-api.onrender.com/api/v1/app';
    expect(resolveDevApiUrl(prod, 'ios', '192.168.1.18:8081')).toBe(prod);
    expect(resolveDevApiUrl('http://127.0.0.10:8000/x', 'ios', '192.168.1.18:8081')).toBe('http://127.0.0.10:8000/x');
  });
});
