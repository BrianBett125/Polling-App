import { createHash } from 'node:crypto';

export { VOTER_COOKIE, VOTER_COOKIE_MAX_AGE, isVoterSecret, newVoterSecret, voterCookieOptions } from './voter-cookie';

/**
 * What the database stores: the hex SHA-256 of the cookie secret, so a database
 * leak does not hand out working cookies. Same secret always gives the same token.
 */
export function voterToken(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}
