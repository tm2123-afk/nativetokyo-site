# nativetokyo.jp

Astro製の静的サイト。

## セットアップ

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # dist/ に出力
```

## Netlifyへのデプロイ

1. このフォルダをGitHubリポジトリにpush
2. Netlify → Add new site → Import an existing project → GitHubを選択
3. ビルド設定：
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Domain management で nativetokyo.jp を新サイトに向け替え

以降は `git push` するだけで自動デプロイされる。

## 問い合わせフォーム

Netlify Forms を使用（`data-netlify="true"`）。
デプロイ後、Netlify管理画面の Forms に送信内容が溜まる。
通知メールの設定は Forms → Settings → Form notifications から。

## 計測

- GA4: `G-3T4ZWVDF7H`（src/layouts/Layout.astro に直書き）
- カスタムイベント: 要素に `data-ga="イベント名" data-ga-location="場所"` を付けると自動送信される
  - `cta_contact_click` / `cta_diagnosis_click` / `form_submit`

## 記事の追加

`src/content/blog/` に .md を置くだけ。frontmatterは以下：

```yaml
---
title: "記事タイトル"
description: "検索結果に出る説明文。120文字前後"
pubDate: 2026-08-01
draft: false
---
```

`draft: true` にすると公開されない。

## デザイントークン

`src/styles/global.css` の `@theme` に集約。
paper / ink / navy / navy-soft / amber / line の6色のみ。
