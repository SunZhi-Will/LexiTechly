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
                'src/pages/vocabulary': resolve(__dirname, 'src/pages/vocabulary.html'),
                'src/pages/popup': resolve(__dirname, 'src/pages/popup.html'),
                'src/scripts/content': resolve(__dirname, 'src/scripts/content.ts')
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
        alias: {
            '@': resolve(__dirname, 'src')
        }
    },
    optimizeDeps: {
        include: ['./src/scripts/content.ts']
    },
    publicDir: 'src/assets'
}); 