import { execFileSync } from 'node:child_process';
import path from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { resolveE2eConfig } = require('../scripts/e2e-env.cjs') as {
  resolveE2eConfig: (env?: NodeJS.ProcessEnv, repoRoot?: string) => {
    repoRoot: string;
    runtimeMode: 'host' | 'docker';
    composeProject: string | null;
  };
};

export default async function globalTeardown(): Promise<void> {
  const config = resolveE2eConfig(process.env, path.resolve(__dirname, '../..'));
  if (config.runtimeMode !== 'docker' || !config.composeProject) {
    return;
  }
  const names = [`${config.composeProject}-e2e-api`, `${config.composeProject}-e2e-web`];
  try {
    execFileSync('docker', ['rm', '-f', ...names], {
      cwd: config.repoRoot,
      stdio: 'ignore',
    });
  } catch {
    // Container đã tự dừng bởi --rm
  }
}
