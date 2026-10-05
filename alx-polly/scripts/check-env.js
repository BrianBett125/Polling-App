// Runs before `next build`. NEXT_PUBLIC_* values are baked into the bundle at build time, so a
// deploy built without them cannot work. On Vercel that is a hard error with a readable message;
// locally it is a warning so tests and CI can still build without real credentials.
const REQUIRED = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];
const RECOMMENDED = ['SUPABASE_SERVICE_ROLE_KEY']; // server only; voting is refused without it

function checkEnv(env = process.env) {
  const missing = REQUIRED.filter((k) => !env[k]);
  const missingServer = RECOMMENDED.filter((k) => !env[k]);
  return { missing, missingServer, onVercel: !!env.VERCEL };
}

module.exports = { checkEnv };

if (require.main === module) {
  const { missing, missingServer, onVercel } = checkEnv();
  if (missing.length) {
    const msg = `Missing build-time environment variables: ${missing.join(', ')}.\nAdd them in Vercel > Project > Settings > Environment Variables (for Production and Preview), then redeploy.`;
    if (onVercel) {
      console.error(`\n[check-env] ERROR\n${msg}\n`);
      process.exit(1);
    }
    console.warn(`\n[check-env] warning: ${msg}\nThe build will continue; the app will show a "not configured" message at runtime.\n`);
  }
  if (missingServer.length) {
    console.warn(`[check-env] warning: ${missingServer.join(', ')} is not set. Voting will be refused at runtime until it is.`);
  }
}
