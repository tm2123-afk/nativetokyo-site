// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://nativetokyo.jp',
  integrations: [
    sitemap({
      // 送信完了ページなど、検索結果に出す必要のないページを除外
      filter: (page) => !page.includes('/thanks'),
    }),
  ],
  build: {
    // CSSをHTMLにインライン化。和文サイトはCSSが小さいので
    // リクエストが1本減る方が速い。副次的にfile://でも表示できる
    inlineStylesheets: 'always',
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
