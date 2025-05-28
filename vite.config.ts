import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import { resolve } from 'path';

const manifest = require('./manifest.json');

export default defineConfig({
    plugins: [
        crx({ manifest })
    ],
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        chunkSizeWarningLimit: 300,
        rollupOptions: {
            input: {
                vocabulary: resolve(__dirname, 'src/pages/vocabulary.html')
            },
            output: {
                manualChunks: (id) => {
                    // Vis.js 相關套件單獨分塊
                    if (id.includes('vis-network') || id.includes('vis-data')) {
                        return 'vis-libs';
                    }

                    // 關聯圖功能分塊
                    if (id.includes('relationship-graph')) {
                        return 'relationship-graph';
                    }

                    // AI 分析相關功能分塊
                    if (id.includes('analysis') || id.includes('ai-service')) {
                        return 'analysis';
                    }

                    // 單字核心功能分塊
                    if (id.includes('word-display') || id.includes('word-interactions')) {
                        return 'vocabulary-core';
                    }

                    // 工具類分塊
                    if (id.includes('storage') || id.includes('filters') || id.includes('formatters')) {
                        return 'utils';
                    }

                    // Node modules 分塊
                    if (id.includes('node_modules')) {
                        return 'vendor';
                    }
                }
            }
        }
    },
    publicDir: 'src/assets'
}); 