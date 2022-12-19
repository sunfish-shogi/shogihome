import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { htmlTemplate } from './plugins/html_template'

export default defineConfig({
  resolve: {
    alias: [{ find: '@', replacement: '/src' }]
  },
  plugins: [
    vue(),
    htmlTemplate({
      "APP_TITLE": `Electron将棋 Version ${process.env.npm_package_version}`,
    }),
  ],
  base: './',
  build: {
    chunkSizeWarningLimit: 5000000,
  },
});