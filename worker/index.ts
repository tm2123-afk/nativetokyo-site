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

const SIGNATURE = `
  <hr style="border:none;border-top:1px solid #ddd;margin:24px 0">
  <p style="font-size:13px;color:#555;line-height:1.8">
    NATIVETOKYO<br>
    マツモトタイシ<br>
    <a href="https://nativetokyo.jp/">https://nativetokyo.jp/</a><br>
    ※このメールは送信専用です。ご返信いただいた場合も、担当者に届きます。
  </p>`;

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

  // お客様への自動返信（失敗しても、問い合わせ自体は受け付け済みとして扱う）
  const autoReply = await sendEmail(env, {
    from: 'NATIVETOKYO <info@nativetokyo.jp>',
    to: [email],
    reply_to: 'info@nativetokyo.jp',
    subject: '【NATIVETOKYO】お問い合わせを受け付けました',
    html: `
      <p>${escapeHtml(company)}<br>${escapeHtml(name)} 様</p>
      <p>このたびは、NATIVETOKYOにお問い合わせいただき、ありがとうございます。<br>
      以下の内容で受け付けました。通常2営業日以内に、担当者よりご連絡いたします。</p>
      <p><strong>ご関心のある領域：</strong>${escapeHtml(topicLabel[topic] || topic)}</p>
      <p><strong>ご相談内容：</strong><br>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
      ${SIGNATURE}
    `,
  });
  if (!autoReply.ok) console.error('Auto-reply error:', await autoReply.text());

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

  if (res.ok) {
    // お客様への診断結果メール（失敗しても、画面には結果を表示する）
    const autoReply = await sendEmail(env, {
      from: 'NATIVETOKYO 診断 <info@nativetokyo.jp>',
      to: [email],
      reply_to: 'info@nativetokyo.jp',
      subject: '【NATIVETOKYO】プレゼンス診断の結果',
      html: `
        <p>${escapeHtml(company)}<br>${escapeHtml(name)} 様</p>
        <p>プレゼンス診断にご回答いただき、ありがとうございます。結果は以下のとおりです。</p>
        <p><strong>診断スコア：</strong>${escapeHtml(score)}</p>
        <p><strong>診断結果：</strong>${escapeHtml(tier)}</p>
        <p>どこから整えると効果が出やすいかは、社員の方の状態や業種によって変わります。<br>
        結果の詳しい読み方や、自社に合わせた進め方をお知りになりたい場合は、このメールにそのままご返信いただくか、<br>
        <a href="https://nativetokyo.jp/contact/">お問い合わせページ</a>からご相談ください。</p>
        ${SIGNATURE}
      `,
    });
    if (!autoReply.ok) console.error('Auto-reply error:', await autoReply.text());
  }

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
