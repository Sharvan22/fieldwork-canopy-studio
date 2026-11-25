import { build } from 'esbuild'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

// Bundle the service and PDF library so the downloadable demo only requires Node.
await build({
  entryPoints: ['server/start.ts'],
  outfile: 'dist/server.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  legalComments: 'eof',
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
})

const lock = JSON.parse(await readFile('package-lock.json', 'utf8'))
const licenses = []
for (const [folder, entry] of Object.entries(lock.packages)) {
  if (!folder || entry.dev || entry.optional) continue
  const files = await readdir(folder)
  const license = files.find((name) => /^(license|licence|ofl)(\..+)?$/i.test(name))
  if (license)
    licenses.push(
      folder.split('node_modules/').at(-1) +
        ' ' +
        entry.version +
        '\n\n' +
        (await readFile(path.join(folder, license), 'utf8')),
    )
}
await writeFile(
  'dist/THIRD-PARTY-NOTICES.txt',
  licenses.join('\n\n----------------------------------------\n\n'),
)
