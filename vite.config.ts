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
                    // 排除 content script，讓它保持為單一檔案
                    if (id.includes('src/scripts/content')) {
                        return undefined; // 不分割 content script
                    }

                    // Vis.js 相關套件單獨分塊
                    if (id.includes('vis-network') || id.includes('vis-data')) {
                        return 'vis-libs';
                    }

                    // 關聯圖功能分塊
                    if (id.includes('relationship-graph')) {
                        return 'relationship-graph';
                    }

                    // AI 分析相關功能分塊（但不包含 content script 中的）
                    if (id.includes('analysis') || id.includes('ai-service')) {
                        // 如果是 content script 的分析模組，不分割
                        if (id.includes('src/scripts/content/analysis')) {
                            return undefined;
                        }
                        return 'analysis';
                    }

                    // 單字核心功能分塊
                    if (id.includes('word-display') || id.includes('word-interactions')) {
                        return 'vocabulary-core';
                    }

                    // 工具類分塊（但不包含 content script 中的）
                    if (id.includes('storage') || id.includes('filters') || id.includes('formatters')) {
                        // 如果是 content script 的工具模組，不分割
                        if (id.includes('src/scripts/content/')) {
                            return undefined;
                        }
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