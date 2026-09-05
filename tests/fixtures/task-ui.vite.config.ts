import { mergeConfig } from 'vite'
import base from '../../vite.config'
export default mergeConfig(base, {
  build: { outDir: 'output/playwright/task-ui', rollupOptions: { input: ['tests/fixtures/agent-queue-preview.html', 'tests/fixtures/viewer-compact-preview.html', 'tests/fixtures/processing-preview.html', 'tests/fixtures/review-actions-preview.html'] } },
})
