import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// The workflows live at the repository root (.github/), the app in alx-polly/.
const appRoot = path.join(__dirname, '..');
const repoRoot = path.join(appRoot, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));

// ---------------------------------------------------------------------------------------------
// A deliberately small YAML reader: block maps, block lists, `|` and `>` scalars, flow lists of
// scalars, quotes, comments. Enough for GitHub workflow files, no new dependency. If a workflow
// ever needs more (anchors, multi-document), this throws instead of guessing.
// ---------------------------------------------------------------------------------------------
type Y = string | number | boolean | null | Y[] | { [k: string]: Y };
type Line = { indent: number; text: string };

function stripComment(raw: string): string {
  let quote: string | null = null;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      if (i === 0 || /[\s:[,-]/.test(raw[i - 1])) quote = c;
    } else if (c === '#' && (i === 0 || /\s/.test(raw[i - 1]))) {
      return raw.slice(0, i);
    }
  }
  return raw;
}

function scalar(s: string): Y {
  const t = s.trim();
  if (t === '' || t === '~' || t === 'null') return null;
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (/^-?\d+$/.test(t)) return Number(t);
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  if (t.startsWith('[') && t.endsWith(']')) {
    const inner = t.slice(1, -1).trim();
    return inner ? inner.split(',').map((x) => scalar(x)) : [];
  }
  if (/^[&*!{]/.test(t)) throw new Error(`unsupported YAML construct: ${t}`);
  return t;
}

function parseYaml(text: string): Y {
  const lines: Line[] = text
    .split('\n')
    .map((raw) => ({ indent: raw.length - raw.trimStart().length, text: stripComment(raw).trim() }))
    .filter((l) => l.text !== '');
  let i = 0;

  const isItem = (t: string) => t === '-' || t.startsWith('- ');
  const KEY = /^("[^"]+"|'[^']+'|[^\s:'"][^:]*?):(?:\s+(.*))?$/;

  function block(indent: number): Y {
    return isItem(lines[i].text) ? list(indent) : map(indent);
  }

  function list(indent: number): Y[] {
    const out: Y[] = [];
    while (i < lines.length && lines[i].indent === indent && isItem(lines[i].text)) {
      const rest = lines[i].text.slice(1).trim();
      if (rest === '') {
        i++;
        out.push(lines[i] && lines[i].indent > indent ? block(lines[i].indent) : null);
      } else if (KEY.test(rest) && !rest.startsWith('"') && !rest.startsWith("'") && !rest.startsWith('[')) {
        // "- key: value": the map's keys line up with the text after the dash.
        const offset = lines[i].text.length - rest.length;
        lines[i] = { indent: indent + offset, text: rest };
        out.push(map(indent + offset));
      } else {
        i++;
        out.push(scalar(rest));
      }
    }
    return out;
  }

  function map(indent: number): { [k: string]: Y } {
    const out: { [k: string]: Y } = {};
    while (i < lines.length && lines[i].indent === indent && !isItem(lines[i].text)) {
      const m = lines[i].text.match(KEY);
      if (!m) throw new Error(`cannot parse line: ${lines[i].text}`);
      const key = m[1].replace(/^["']|["']$/g, '');
      const value = (m[2] ?? '').trim();
      i++;
      if (/^[|>][-+]?$/.test(value)) {
        const parts: string[] = [];
        while (i < lines.length && lines[i].indent > indent) parts.push(lines[i++].text);
        out[key] = parts.join(value[0] === '|' ? '\n' : ' ');
      } else if (value === '') {
        out[key] = i < lines.length && lines[i].indent > indent ? block(lines[i].indent) : null;
      } else {
        out[key] = scalar(value);
      }
    }
    return out;
  }

  const result = lines.length ? block(lines[0].indent) : null;
  if (i < lines.length) throw new Error(`unparsed content at: ${lines[i].text}`);
  return result;
}

// ---------------------------------------------------------------------------------------------

type Step = { name?: string; uses?: string; run?: string; with?: Record<string, Y>; env?: Record<string, string>; 'working-directory'?: string };
type Job = { 'runs-on': string; steps: Step[]; services?: Record<string, { image: string; ports: string[]; options: string; env: Record<string, string> }>; permissions?: Record<string, string>; defaults?: { run?: { 'working-directory'?: string } }; needs?: string; 'timeout-minutes'?: number };
type Workflow = { name: string; on: Record<string, Y>; concurrency: { group: string; 'cancel-in-progress': boolean }; permissions: Record<string, string>; defaults?: { run?: { 'working-directory'?: string } }; jobs: Record<string, Job> };

const read = (file: string) => fs.readFileSync(path.join(repoRoot, '.github', 'workflows', file), 'utf8');
const load = (file: string) => parseYaml(read(file)) as unknown as Workflow;

const ci = load('ci.yml');
const live = load('live-checks.yml');

const effectiveDir = (wf: Workflow, job: Job, step: Step) => step['working-directory'] ?? job.defaults?.run?.['working-directory'] ?? wf.defaults?.run?.['working-directory'] ?? '.';
const runSteps = (job: Job) => job.steps.filter((s) => s.run);
const allRunLines = (wf: Workflow) => Object.values(wf.jobs).flatMap((j) => runSteps(j).flatMap((s) => s.run!.split('\n').map((l) => l.trim()).filter(Boolean)));

describe('the YAML reader used here', () => {
  it('handles maps, lists of maps, flow lists, block scalars, quotes and comments', () => {
    const y = parseYaml(
      ['a: 1', 'b:', '  c: [x, y]  # trailing comment', '  d: "quoted # not a comment"', 'e:', '  - name: one', '    run: |', '      line1', '      line2', '  - uses: foo@v1', '    with:', '      k: v', 'f: >-', '  folded', '  text'].join('\n'),
    );
    expect(y).toEqual({
      a: 1,
      b: { c: ['x', 'y'], d: 'quoted # not a comment' },
      e: [{ name: 'one', run: 'line1\nline2' }, { uses: 'foo@v1', with: { k: 'v' } }],
      f: 'folded text',
    });
  });
  it('refuses constructs it cannot read', () => {
    expect(() => parseYaml('a: &anchor 1')).toThrow(/unsupported/);
  });
  it('reads both workflows into the shapes the tests below rely on', () => {
    expect(Object.keys(ci.jobs)).toEqual(['checks', 'db-tests']);
    expect(Object.keys(live.jobs)).toEqual(['smoke', 'e2e']);
  });
});

describe('ci.yml', () => {
  it('runs on pull requests and on pushes to main only', () => {
    expect(Object.keys(ci.on).sort()).toEqual(['pull_request', 'push']);
    expect((ci.on.push as { branches: string[] }).branches).toEqual(['main']);
  });

  it('cancels superseded runs, per workflow and ref', () => {
    expect(ci.concurrency['cancel-in-progress']).toBe(true);
    expect(ci.concurrency.group).toContain('github.ref');
    expect(ci.concurrency.group).toContain('github.workflow');
  });

  it('has read-only permissions, at the top level and on every job', () => {
    expect(ci.permissions).toEqual({ contents: 'read' });
    for (const job of Object.values(ci.jobs)) {
      if (job.permissions) expect(Object.values(job.permissions).every((v) => v === 'read' || v === 'none')).toBe(true);
    }
  });

  it('pins actions to a major version that exists and uses Node 22 with the npm cache keyed on the lockfile', () => {
    for (const job of Object.values(ci.jobs)) {
      for (const s of job.steps.filter((x) => x.uses)) expect(s.uses).toMatch(/^actions\/(checkout|setup-node)@v4$/);
      const node = job.steps.find((s) => s.uses?.startsWith('actions/setup-node'))!;
      expect(node.with).toMatchObject({ 'node-version': 22, cache: 'npm', 'cache-dependency-path': 'alx-polly/package-lock.json' });
    }
    expect(fs.existsSync(path.join(repoRoot, 'alx-polly', 'package-lock.json'))).toBe(true);
  });

  it('runs every command inside alx-polly', () => {
    for (const job of Object.values(ci.jobs)) {
      for (const s of runSteps(job)) expect(effectiveDir(ci, job, s)).toBe('alx-polly');
    }
    expect(fs.statSync(path.join(repoRoot, 'alx-polly')).isDirectory()).toBe(true);
  });

  it('checks job: npm ci, typecheck, unit tests, then build with placeholder public env', () => {
    const cmds = runSteps(ci.jobs.checks).map((s) => s.run);
    expect(cmds).toEqual(['npm ci', 'npm run typecheck', 'npm test', 'npm run build']);
    const build = ci.jobs.checks.steps.find((s) => s.run === 'npm run build')!;
    expect(build.env).toEqual({ NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'ci-placeholder' });
  });

  it('db-tests job: postgres:17 service with a health check on 5432, then npm run test:db against it', () => {
    const job = ci.jobs['db-tests'];
    const pg = job.services!.postgres;
    expect(pg.image).toBe('postgres:17');
    expect(pg.ports).toContain('5432:5432');
    expect(pg.options).toContain('--health-cmd');
    expect(pg.options).toContain('pg_isready');
    expect(pg.env.POSTGRES_PASSWORD).toBe('postgres');
    const step = job.steps.find((s) => s.run === 'npm run test:db')!;
    expect(step.env).toEqual({ TEST_DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/postgres' });
    expect(pkg.scripts['test:db']).toContain('vitest.db.config.ts');
  });

  it('every npm script it runs exists in package.json, and npm ci has a lockfile', () => {
    for (const line of allRunLines(ci)) {
      const m = line.match(/^npm (?:run )?(\S+)/);
      expect(m, line).not.toBeNull();
      const name = m![1];
      if (name === 'ci') expect(fs.existsSync(path.join(appRoot, 'package-lock.json'))).toBe(true);
      else expect(pkg.scripts[name], `npm script "${name}" is missing from package.json`).toBeTypeOf('string');
    }
  });

  it('uses no secrets at all and prints no environment', () => {
    expect(read('ci.yml')).not.toMatch(/secrets\./);
    expect(read('ci.yml')).not.toMatch(/service_role/i);
    for (const line of allRunLines(ci)) expect(line).not.toMatch(/\becho\b|\bprintenv\b|^env\b|set -x|\bcurl\b/);
  });

  it('has timeouts so a hung job cannot burn minutes', () => {
    for (const job of Object.values(ci.jobs)) expect(job['timeout-minutes']).toBeLessThanOrEqual(30);
  });
});

describe('live-checks.yml', () => {
  it('is manual only, with a base_url input defaulting to the production site', () => {
    expect(Object.keys(live.on)).toEqual(['workflow_dispatch']);
    const inputs = (live.on.workflow_dispatch as { inputs: Record<string, { default: string }> }).inputs;
    expect(Object.keys(inputs)).toEqual(['base_url']);
    expect(inputs.base_url.default).toBe('https://polling-app-green.vercel.app');
  });

  it('is read-only and pins actions', () => {
    expect(live.permissions).toEqual({ contents: 'read' });
    for (const job of Object.values(live.jobs)) for (const s of job.steps.filter((x) => x.uses)) expect(s.uses).toMatch(/^actions\/(checkout|setup-node)@v4$/);
  });

  it('runs scripts/smoke.js and the e2e script, both of which exist', () => {
    const smoke = runSteps(live.jobs.smoke)[0];
    expect(smoke.run).toBe('node scripts/smoke.js "$BASE_URL"');
    expect(smoke['working-directory']).toBe('alx-polly');
    expect(smoke.env).toEqual({ BASE_URL: '${{ inputs.base_url }}' });
    expect(fs.existsSync(path.join(appRoot, 'scripts', 'smoke.js'))).toBe(true);
    const e2e = live.jobs.e2e.steps.find((s) => s.run === 'node run.js')!;
    expect(e2e['working-directory']).toBe('alx-polly/scripts/e2e');
    expect(fs.existsSync(path.join(appRoot, 'scripts', 'e2e', 'run.js'))).toBe(true);
    expect(fs.existsSync(path.join(appRoot, 'scripts', 'e2e', 'package-lock.json'))).toBe(true);
  });

  it('references secrets only as env values of the e2e step', () => {
    const lines = read('live-checks.yml').split('\n').filter((l) => /secrets\./.test(l) && !l.trim().startsWith('#'));
    expect(lines.map((l) => l.trim()).sort()).toEqual(['SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}', 'SUPABASE_URL: ${{ secrets.SUPABASE_URL }}']);
    const e2e = live.jobs.e2e.steps.find((s) => s.run === 'node run.js')!;
    expect(e2e.env).toMatchObject({
      SUPABASE_URL: '${{ secrets.SUPABASE_URL }}',
      SUPABASE_SERVICE_ROLE_KEY: '${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}',
    });
  });

  it('never interpolates expressions into a shell command (script injection) or echoes anything', () => {
    for (const line of allRunLines(live)) {
      expect(line).not.toContain('${{');
      expect(line).not.toMatch(/\becho\b|\bprintenv\b|^env\b|set -x/);
    }
  });

  it('does not upload artifacts (the repository is public)', () => {
    expect(read('live-checks.yml')).not.toMatch(/upload-artifact/);
    expect(read('ci.yml')).not.toMatch(/upload-artifact/);
  });
});

describe('package wiring', () => {
  it('adds the operator scripts and keeps the e2e browser dependency out of the app', () => {
    expect(pkg.scripts.backup).toBe('node scripts/backup.js');
    expect(pkg.scripts.smoke).toBe('node scripts/smoke.js');
    expect(pkg.scripts['e2e:live']).toBe('node scripts/e2e/run.js');
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(Object.keys(deps).filter((d) => /playwright|puppeteer/.test(d))).toEqual([]);
    const e2ePkg = JSON.parse(fs.readFileSync(path.join(appRoot, 'scripts', 'e2e', 'package.json'), 'utf8'));
    expect(e2ePkg.dependencies['playwright-core']).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('ignores local backups', () => {
    expect(fs.readFileSync(path.join(appRoot, '.gitignore'), 'utf8').split('\n')).toContain('/backups/');
  });
});
