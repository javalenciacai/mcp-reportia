/**
 * Version real del paquete, leida de `package.json` en tiempo de ejecucion.
 *
 * `initialize` y el `User-Agent` por defecto quedaron congelados en `0.1.0`
 * (la version del primer release) porque varios modulos la tenian
 * hardcodeada. Una sola fuente evita que un release futuro tenga que tocar
 * cada sitio por separado.
 *
 * Se lee con `readFileSync` (no `import ../package.json`): `package.json`
 * queda fuera de `rootDir: "src"` (tsconfig.json) y `resolveJsonModule` no
 * lo acepta ahi.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

function readPackageVersion(): string {
  // Un nivel por encima de este modulo es la raiz del paquete tanto en
  // `src/package-info.ts` (fuente) como en `dist/package-info.js` (build).
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const pkgPath = path.join(moduleDir, '..', 'package.json');
  const raw = readFileSync(pkgPath, 'utf8');
  const pkg = JSON.parse(raw) as { version?: unknown };
  if (typeof pkg.version !== 'string' || pkg.version === '') {
    throw new Error(`package.json en ${pkgPath} no tiene "version" valida.`);
  }
  return pkg.version;
}

export const PACKAGE_VERSION = readPackageVersion();
