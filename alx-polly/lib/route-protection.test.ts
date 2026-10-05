import { describe, expect, it } from 'vitest';
import { isProtectedPath, isUuid, safeNextPath } from './route-protection';

const ID = '11111111-1111-4111-8111-111111111111';

describe('isProtectedPath', () => {
  it.each(['/polls', '/polls/', '/polls/new', '/polls/new/', `/polls/${ID}/edit`, `/polls/${ID}/edit/`])('protects %s', (p) => {
    expect(isProtectedPath(p)).toBe(true);
  });

  it.each(['/polls//new', '//polls/new', '/polls/%6Eew', '/POLLS/New', '/polls/new//', `/polls//${ID}/edit`, `/polls/${ID}/%65dit`, '/polls/%E0%A4%A'])(
    'protects obfuscated variant %s',
    (p) => {
      expect(isProtectedPath(p)).toBe(true);
    },
  );

  it.each(['/', '/auth', '/auth/callback', `/polls/${ID}`, `/polls/${ID}/`, '/pollsx', '/polls/new/extra', '/_next/static/x.js'])(
    'leaves %s public',
    (p) => {
      expect(isProtectedPath(p)).toBe(false);
    },
  );
});

describe('safeNextPath', () => {
  it('keeps same-site paths', () => {
    expect(safeNextPath('/polls/new')).toBe('/polls/new');
    expect(safeNextPath(`/polls/${ID}/edit?x=1`)).toBe(`/polls/${ID}/edit?x=1`);
  });

  it.each([null, undefined, '', 'polls', '//evil.example', 'https://evil.example', '/\\evil.example', '/a\nb', 'javascript:alert(1)'])(
    'falls back for %j',
    (v) => {
      expect(safeNextPath(v as string | null)).toBe('/polls');
    },
  );
});

describe('isUuid', () => {
  it('accepts uuids and rejects everything else', () => {
    expect(isUuid(ID)).toBe(true);
    expect(isUuid(ID.toUpperCase())).toBe(true);
    for (const bad of ['', 'abc', `${ID}x`, ` ${ID}`, "1' or '1'='1", '../etc/passwd']) expect(isUuid(bad)).toBe(false);
  });
});
