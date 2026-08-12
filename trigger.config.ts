import { defineConfig } from '@trigger.dev/sdk';

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? '',
  dirs: ['./trigger'],
  runtime: 'node',
  logLevel: 'info',
  maxDuration: 1800,
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1_000,
      maxTimeoutInMs: 30_000,
      factor: 2,
      randomize: true,
    },
  },
});
