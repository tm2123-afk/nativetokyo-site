// Cloudflare Worker（静的アセット配信 + API処理を1本化）
// /functions ディレクトリ方式は Cloudflare Pages 専用のため、
// 通常のWorkersデプロイではここに全ロジックを書く

export interface Env {
  ASSETS: Fetcher;
  RESEND_API_KEY: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function sendEmail(env: Env, payload: Record<string, unknown>) {
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

async function handleContact(request: Request, env: Env): Promise<Response> {
  const formData = await request.formData();

  const botField = formData.get('bot-field');
  if (botField) {
    return Response.redirect(new URL('/thanks', request.url).toString(), 303);
  }

  const company = formData.get('company')?.toString() || '';
  const name = formData.get('name')?.toString() || '';
  const email = formData.get('email')?.toString() || '';
  const topic = formData.get('topic')?.toString() || '';
  const message = formData.get('message')?.toString() || '';

  if (!company || !name || !email) {
    return new Response('必須項目が入力されていません。', { status: 400 });
  }

  const topicLabel: Record<string, string> = {
    presence: 'プレゼンスマネジメント研修',
    ai_ningenryoku: 'AI時代の人間力研修',
    both: '両方／どちらか分からない',
    other: 'その他',
  };

  const res = await sendEmail(env, {
    from: 'NATIVETOKYO サイト <info@nativetokyo.jp>',
    to: ['info@nativetokyo.jp'],
    reply_to: email,
    subject: `【お問い合わせ】${company} 様より`,
    html: `
      <p><strong>会社名：</strong>${escapeHtml(company)}</p>
      <p><strong>ご担当者名：</strong>${escapeHtml(name)}</p>
      <p><strong>メールアドレス：</strong>${escapeHtml(email)}</p>
      <p><strong>ご関心のある領域：</strong>${escapeHtml(topicLabel[topic] || topic)}</p>
      <p><strong>ご相談内容：</strong></p>
      <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
    `,
  });

  if (!res.ok) {
    console.error('Resend error:', await res.text());
    return new Response('送信に失敗しました。時間をおいて再度お試しください。', { status: 502 });
  }

  return Response.redirect(new URL('/thanks', request.url).toString(), 303);
}

async function handleDiagnosisLead(request: Request, env: Env): Promise<Response> {
  const formData = await request.formData();

  const botField = formData.get('lead-bot-field');
  if (botField) {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const company = formData.get('company')?.toString() || '';
  const name = formData.get('name')?.toString() || '';
  const email = formData.get('email')?.toString() || '';
  const score = formData.get('score')?.toString() || '';
  const tier = formData.get('tier')?.toString() || '';

  if (!company || !name || !email) {
    return new Response(JSON.stringify({ ok: false, error: 'missing_fields' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const res = await sendEmail(env, {
    from: 'NATIVETOKYO 診断 <info@nativetokyo.jp>',
    to: ['info@nativetokyo.jp'],
    reply_to: email,
    subject: `【診断リード】${company} 様（${tier}）`,
    html: `
      <p><strong>会社名：</strong>${escapeHtml(company)}</p>
      <p><strong>お名前：</strong>${escapeHtml(name)}</p>
      <p><strong>メールアドレス：</strong>${escapeHtml(email)}</p>
      <p><strong>診断スコア：</strong>${escapeHtml(score)}</p>
      <p><strong>診断結果：</strong>${escapeHtml(tier)}</p>
    `,
  });

  if (!res.ok) {
    console.error('Resend error:', await res.text());
    return new Response(JSON.stringify({ ok: false, error: 'send_failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    try {
      if (url.pathname === '/api/contact' && request.method === 'POST') {
        return await handleContact(request, env);
      }
      if (url.pathname === '/api/diagnosis-lead' && request.method === 'POST') {
        return await handleDiagnosisLead(request, env);
      }
    } catch (err) {
      console.error('worker error:', err);
      return new Response('サーバーエラーが発生しました。', { status: 500 });
    }

    // API以外は全部、ビルド済みの静的ファイルをそのまま返す
    return env.ASSETS.fetch(request);
  },
};
