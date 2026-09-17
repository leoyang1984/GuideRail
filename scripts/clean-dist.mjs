import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

const target = resolve('dist');
if (target !== resolve(process.cwd(), 'dist')) throw new Error('Unexpected build output path');
rmSync(target, { recursive: true, force: true });
