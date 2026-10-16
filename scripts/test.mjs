import { build } from 'vite'
import { mkdtempSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
const output = mkdtempSync(join(tmpdir(), 'browser-ai-tests-'))
try {
  await build({ configFile: false, logLevel: 'warn', build: {
    ssr: 'tests/campaign.test.ts', outDir: output, emptyOutDir: true, target: 'node22', minify: false,
    rollupOptions: { output: { entryFileNames: 'campaign.test.mjs' } }
  } })
  symlinkSync(resolve('node_modules'), join(output, 'node_modules'), 'dir')
  const result = spawnSync(process.execPath, ['--test', join(output, 'campaign.test.mjs')], { stdio: 'inherit' })
  process.exitCode = result.status ?? 1
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
