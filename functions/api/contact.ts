// Cloudflare Pages Function: /api/contact
// お問い合わせフォームの送信を受け取り、Resend経由でメール送信する

interface Env {
  RESEND_API_KEY: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  try {
    const formData = await request.formData();

    // ハニーポット：botが埋めていたら黙って成功扱いにする
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

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
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
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error('Resend error:', errText);
      return new Response('送信に失敗しました。時間をおいて再度お試しください。', { status: 502 });
    }

    return Response.redirect(new URL('/thanks', request.url).toString(), 303);
  } catch (err) {
    console.error('contact function error:', err);
    return new Response('送信中にエラーが発生しました。', { status: 500 });
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
