import { describe, expect, it } from 'vitest';
import { redactTokenFromUrl } from '../src/log.js';

describe('redactTokenFromUrl', () => {
  it('redacts a token query param, leaving the rest of the URL intact', () => {
    expect(redactTokenFromUrl('/ws?token=eyJhbGciOiJIUzI1NiJ9.secret.stuff')).toBe('/ws?token=%5Bredacted%5D');
  });

  it('leaves a URL with no query string untouched', () => {
    expect(redactTokenFromUrl('/health')).toBe('/health');
  });

  it('leaves a query string with no token param untouched', () => {
    expect(redactTokenFromUrl('/tournaments/join/ABC123?foo=bar')).toBe('/tournaments/join/ABC123?foo=bar');
  });

  it('preserves other query params alongside a redacted token', () => {
    const redacted = redactTokenFromUrl('/ws?token=secret&roomId=abc');
    expect(redacted).toContain('roomId=abc');
    expect(redacted).not.toContain('secret');
  });
});
