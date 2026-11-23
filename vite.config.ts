import { build as viteBuild, defineConfig, type Plugin } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const manifest = require('./manifest.json');

// 圖片翻譯的 OCR 只用 ONNX Runtime 的 WASM 版：ppu-paddle-ocr 內部 import 'onnxruntime-web'，一起指過去，
// 只打包一份，也不會帶進用不到的 WebGPU 版
const ORT_WASM_ALIAS = { find: /^onnxruntime-web$/, replacement: 'onnxruntime-web/wasm' };
// ONNX Runtime 的 WASM 執行檔與載入器（offscreen 文件把 wasmPaths 指到 dist/ort/）
const ORT_FILES = ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs'];
const IMAGE_TRANSLATE_CONTENT = 'image-translate-content.js';

/**
 * 圖片翻譯需要、但 crxjs 不會自己產出的兩種檔案：
 * - ort/ 底下的 WASM 與載入器：執行時才用網址載入，照原檔名複製。
 * - image-translate-content.js：背景頁用 chrome.scripting.executeScript({ files }) 注入的內容腳本。
 *   crxjs 產出的內容腳本是「載入器 + ES 模組」，注入後模組還沒載入完，背景頁緊接著送的訊息會沒人接；
 *   所以另外打包成單一個 IIFE 檔，注入完成時監聽器就已經裝好。
 */
function imageTranslateAssets(): Plugin {
    let mode = 'production';
    let outDir = 'dist';
    return {
        name: 'lexitechly-image-translate-assets',
        apply: 'build',
        configResolved(config) {
            mode = config.mode;
            outDir = resolve(config.root, config.build.outDir);
        },
        generateBundle() {
            for (const file of ORT_FILES) {
                this.emitFile({
                    type: 'asset',
                    fileName: `ort/${file}`,
                    source: readFileSync(resolve(__dirname, 'node_modules/onnxruntime-web/dist', file))
                });
            }
        },
        async closeBundle() {
            await viteBuild({
                configFile: false,
                mode,
                logLevel: 'warn',
                publicDir: false,
                build: {
                    outDir,
                    emptyOutDir: false,
                    copyPublicDir: false,
                    lib: {
                        entry: resolve(__dirname, 'src/scripts/image-translate/content-entry.ts'),
                        formats: ['iife'],
                        name: 'LexiTechlyImageTranslate',
                        fileName: () => IMAGE_TRANSLATE_CONTENT
                    }
                }
            });
        }
    };
}

export default defineConfig({
    plugins: [
        crx({ manifest }),
        imageTranslateAssets()
    ],
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        chunkSizeWarningLimit: 300,
        rollupOptions: {
            input: {
                'src/pages/vocabulary': resolve(__dirname, 'src/pages/vocabulary.html'),
                'src/pages/popup': resolve(__dirname, 'src/pages/popup.html'),
                'src/pages/offscreen': resolve(__dirname, 'src/pages/offscreen.html'),
                'src/scripts/content': resolve(__dirname, 'src/scripts/content.ts'),
                'src/scripts/background': resolve(__dirname, 'src/scripts/background.ts')
            },
            output: {
                entryFileNames: '[name].js',
                chunkFileNames: 'assets/[name].[hash].js',
                assetFileNames: (assetInfo) => {
                    const name = assetInfo.name || '';
                    if (name.endsWith('.css')) {
                        return 'styles/[name].[hash][extname]';
                    }
                    if (name.match(/\.(png|jpe?g|gif|svg|ico)$/)) {
                        return 'images/[name].[hash][extname]';
                    }
                    return 'assets/[name].[hash][extname]';
                }
            }
        }
    },
    resolve: {
        alias: [
            { find: '@', replacement: resolve(__dirname, 'src') },
            ORT_WASM_ALIAS
        ]
    },
    optimizeDeps: {
        include: ['./src/scripts/content.ts']
    },
    publicDir: 'src/assets'
}); 