import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envFiles = ['.env.local', '.env.production', '.env'];
const requiredGroups = [
  {
    label: 'Supabase server URL',
    names: ['SUPABASE_URL', 'VITE_SUPABASE_URL'],
    required: true,
  },
  {
    label: 'Supabase anon/publishable server key',
    names: ['SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY'],
    required: true,
  },
  {
    label: 'Resend API key',
    names: ['RESEND_API_KEY'],
    required: true,
  },
  {
    label: 'Verified invite sender',
    names: ['INVITE_FROM_EMAIL', 'RESEND_FROM_EMAIL'],
    required: true,
  },
  {
    label: 'Production invite link base URL',
    names: ['INVITE_SITE_URL', 'VITE_SITE_URL', 'SITE_URL'],
    required: true,
  },
  {
    label: 'Supabase Auth fallback service role key',
    names: ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY'],
    required: false,
  },
];

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  const values = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;

    const key = trimmed.slice(0, index).trim();
    const raw = trimmed.slice(index + 1).trim();
    values[key] = stripWrappingQuotes(raw);
  }

  return values;
}

function stripWrappingQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim();
  }
  return value;
}

const fileValues = Object.assign(
  {},
  ...envFiles.map((file) => parseEnvFile(resolve(process.cwd(), file))),
);
const values = { ...fileValues, ...process.env };
let missingRequired = false;

console.log('Invite email environment check');
console.log('--------------------------------');

for (const group of requiredGroups) {
  const configuredName = group.names.find((name) => values[name] && String(values[name]).trim());
  const status = configuredName ? 'OK' : group.required ? 'MISSING' : 'OPTIONAL';
  if (group.required && !configuredName) missingRequired = true;
  console.log(`${status.padEnd(8)} ${group.label}: ${configuredName || group.names.join(' or ')}`);
}

console.log('');
console.log('For Vercel production, add missing values in Project Settings -> Environment Variables.');
console.log('Never expose SUPABASE_SERVICE_ROLE_KEY with a VITE_ prefix.');

if (missingRequired) {
  process.exitCode = 1;
}
