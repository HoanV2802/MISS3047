'use strict';
// Offline only. Reports variable NAMES and static reasons, never values.
function inspect(env = process.env) {
  const issues = [];
  const missing = key => { if (!env[key]) issues.push(`${key}: missing`); };
  for (const key of ['APP_ORIGIN','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SESSION_ENCRYPTION_KEY']) missing(key);
  if (!env.SUPABASE_SECRET_KEY && !env.SUPABASE_SERVICE_ROLE_KEY) issues.push('SUPABASE_SECRET_KEY: missing (or legacy SUPABASE_SERVICE_ROLE_KEY)');
  for (const key of ['APP_ORIGIN','SUPABASE_URL']) if (env[key]) {
    try {
      const u = new URL(env[key]);
      const local = key === 'APP_ORIGIN' && ['localhost','127.0.0.1'].includes(u.hostname);
      if (u.origin !== env[key] || u.username || u.password || !(u.protocol === 'https:' || (local && u.protocol === 'http:')) || /YOUR_PROJECT|example|placeholder/i.test(u.hostname)) throw Error();
    } catch { issues.push(`${key}: requires exact origin; HTTPS except local APP_ORIGIN; no placeholder`); }
  }
  if (env.SUPABASE_PUBLISHABLE_KEY && !/^(sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_.-]+)$/.test(env.SUPABASE_PUBLISHABLE_KEY)) issues.push('SUPABASE_PUBLISHABLE_KEY: unrecognized key format');
  const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (secret && !/^(sb_secret_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_.-]+)$/.test(secret)) issues.push('SUPABASE_SECRET_KEY: unrecognized key format');
  if (env.SESSION_ENCRYPTION_KEY) {
    const bytes = Buffer.from(env.SESSION_ENCRYPTION_KEY,'base64');
    if (bytes.length !== 32 || bytes.toString('base64') !== env.SESSION_ENCRYPTION_KEY) issues.push('SESSION_ENCRYPTION_KEY: requires canonical base64 encoding of 32 bytes');
  }
  if (env.PORT && (!/^\d+$/.test(env.PORT) || +env.PORT < 1 || +env.PORT > 65535)) issues.push('PORT: requires an integer in 1..65535');
  if (env.TEST_EXPECTED_SUPABASE_URL && env.TEST_EXPECTED_SUPABASE_URL !== env.SUPABASE_URL) issues.push('TEST_EXPECTED_SUPABASE_URL: differs from SUPABASE_URL');
  try { require('../server/demo-auth.cjs').demoConfig(env,env.SUPABASE_URL); }
  catch { issues.push('Staging email auth: requires staging mode, exact project URL, non-production Vercel environment and a separate 32-byte AUTH_MAPPING_KEY'); }
  return { mode: 'offline; no network, migration or provisioning', ready: issues.length === 0, issues,
    limitation: 'Syntax only; does not verify key validity, project access, Auth settings, migrations or authorization.' };
}
if (require.main === module) { const report = inspect(); console.log(JSON.stringify(report,null,2)); process.exitCode = report.ready ? 0 : 1; }
module.exports = { inspect };
