import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default mergeConfig(viteConfig, defineConfig({
  test: { css: true, globalSetup: ['./test/global-setup.ts'] },
}))
