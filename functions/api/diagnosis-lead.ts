// Cloudflare Pages Function: /api/diagnosis-lead
// 組織プレゼンス診断のリード獲得フォームをResend経由でメール送信する
// フロント側はAJAX(fetch)で呼び出し、JSONで結果を返す

interface Env {
  RESEND_API_KEY: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  try {
    const formData = await request.formData();

    const botField = formData.get('lead-bot-field');
    if (botField) {
      // botには成功したフリをして返す（詳細は送らない）
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

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
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
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error('Resend error:', errText);
      return new Response(JSON.stringify({ ok: false, error: 'send_failed' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('diagnosis-lead function error:', err);
    return new Response(JSON.stringify({ ok: false, error: 'server_error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
