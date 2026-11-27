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
    代表 マツモトタイシ<br>
    〒150-0045 東京都渋谷区神泉町10-15<br>
    info@nativetokyo.jp<br>
    <a href="https://nativetokyo.jp/">https://nativetokyo.jp/</a><br>
    ご不明な点は、このメールにそのままご返信ください。
  </p>`;


// 迷惑送信（ボット）の判定。当てはまったら、何も送らずに「受け付けた」ように返す
function isSpam(formData: FormData, honeypot: string, needJapanese = true): string | null {
  if (formData.get(honeypot)) return 'honeypot';
  // ページのJavaScriptを通らずに直接送られたもの
  if (formData.get('js')?.toString() !== '1') return 'no_js';
  // ページを開いてから送信までが短すぎる（人間は数秒以上かかる）
  const ts = Number(formData.get('ts')?.toString() || '0');
  const elapsed = Date.now() - ts;
  if (!ts || elapsed < 4000 || elapsed > 24 * 60 * 60 * 1000) return 'timing';
  const text = ['company', 'name', 'message'].map((k) => formData.get(k)?.toString() || '').join(' ');
  // 日本語が1文字も含まれていない
  // 診断は名前とメールだけなので、ローマ字の名前の個人を弾かないよう、この判定をしない
  if (needJapanese && !/[\u3040-\u30ff\u4e00-\u9fff]/.test(text)) return 'no_japanese';
  // URLが3つ以上
  if ((text.match(/https?:\/\//g) || []).length >= 3) return 'many_urls';
  return null;
}

async function handleContact(request: Request, env: Env): Promise<Response> {
  const formData = await request.formData();

  const spam = isSpam(formData, 'bot-field');
  if (spam) {
    console.log('spam blocked (contact):', spam);
    return Response.redirect(new URL('/thanks', request.url).toString(), 303);
  }

  const company = formData.get('company')?.toString() || '';
  const name = formData.get('name')?.toString() || '';
  const email = formData.get('email')?.toString() || '';
  const topic = formData.get('topic')?.toString() || '';
  const message = formData.get('message')?.toString() || '';

  // 会社名は任意（個人の方は空欄）
  if (!name || !email) {
    return new Response('必須項目が入力されていません。', { status: 400 });
  }
  const who = company || `${name}（個人）`;

  const topicLabel: Record<string, string> = {
    seimitsu: '30項目の精密診断（初回無料）',
    personal: '個人：30分の個別診断（初回無料）',
    personal_coaching: '個人：プレゼンスの個別指導',
    shopping: '個人：スーツ・服選びの同行',
    presence: 'プレゼンスマネジメント研修',
    ai_ningenryoku: 'AI時代の人間力研修',
    both: '両方／どちらか分からない',
    other: 'その他',
  };

  const res = await sendEmail(env, {
    from: 'NATIVETOKYO サイト <info@nativetokyo.jp>',
    to: ['info@nativetokyo.jp'],
    reply_to: email,
    subject: `【お問い合わせ】${who} 様より`,
    html: `
      <p><strong>会社名：</strong>${escapeHtml(company || '（個人）')}</p>
      <p><strong>お名前：</strong>${escapeHtml(name)}</p>
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
      <p>${company ? `${escapeHtml(company)}<br>` : ''}${escapeHtml(name)} 様</p>
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

const NEXT_STEP_CORPORATE = `
        <p style="border:1px solid #1B2A4A;padding:16px;margin:24px 0">
          <strong>30項目の精密診断（通常30,000円 → 初回無料）</strong><br>
          清潔感・トーン・ステータスの3つの段階、30項目で、社員のプレゼンスを個別に確認します。<br>
          30分のオンライン面談で、結果と「どこから直すと効果が大きいか」を直接お伝えします。<br><br>
          <strong>このメールに「精密診断希望」とご返信いただくだけで、お申し込みいただけます。</strong><br>
          ご都合のよい日時の候補を、いくつか添えていただけるとスムーズです。
        </p>`;

const NEXT_STEP_PERSONAL = `
        <p style="border:1px solid #1B2A4A;padding:16px;margin:24px 0">
          <strong>30分の個別診断（オンライン・初回無料）</strong><br>
          服装、色、体型に合う形、姿勢と話し方まで、あなたのプレゼンスを個別に確認します。<br>
          結果と「どこから直すと一番変わるか」を、30分のオンライン面談で直接お伝えします。<br><br>
          <strong>このメールに「個別診断希望」とご返信いただくだけで、お申し込みいただけます。</strong><br>
          ご都合のよい日時の候補を、いくつか添えていただけるとスムーズです。
        </p>`;

async function handleDiagnosisLead(request: Request, env: Env): Promise<Response> {
  const formData = await request.formData();

  const spam = isSpam(formData, 'lead-bot-field', false);
  if (spam) {
    console.log('spam blocked (diagnosis):', spam);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const company = formData.get('company')?.toString() || '';
  const name = formData.get('name')?.toString() || '';
  const email = formData.get('email')?.toString() || '';
  const score = formData.get('score')?.toString() || '';
  const tier = formData.get('tier')?.toString() || '';
  const optin = formData.get('optin')?.toString() === 'yes';
  const kind = formData.get('kind')?.toString() === 'corporate' ? 'corporate' : 'personal';

  // 会社名が必須なのは、法人として受けた場合だけ
  if (!name || !email || (kind === 'corporate' && !company)) {
    return new Response(JSON.stringify({ ok: false, error: 'missing_fields' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const res = await sendEmail(env, {
    from: 'プレゼンスマネジメント事務局 <info@nativetokyo.jp>',
    to: ['info@nativetokyo.jp'],
    reply_to: email,
    subject: `【診断リード・${kind === 'corporate' ? '法人' : '個人'}】${company || name} 様（${tier}）`,
    html: `
      <p><strong>種別：</strong>${kind === 'corporate' ? '法人' : '個人'}</p>
      <p><strong>会社名：</strong>${escapeHtml(company || '（個人）')}</p>
      <p><strong>お名前：</strong>${escapeHtml(name)}</p>
      <p><strong>メールアドレス：</strong>${escapeHtml(email)}</p>
      <p><strong>スコア：</strong>${escapeHtml(score)}</p>
      <p><strong>結果：</strong>${escapeHtml(tier)}</p>
    `,
  });

  if (res.ok) {
    // お客様への診断結果メール（失敗しても、画面には結果を表示する）
    const autoReply = await sendEmail(env, {
      from: 'プレゼンスマネジメント事務局 <info@nativetokyo.jp>',
      to: [email],
      reply_to: 'info@nativetokyo.jp',
      subject: '【NATIVETOKYO】1分チェックの結果',
      html: `
        <p>${company ? `${escapeHtml(company)}<br>` : ''}${escapeHtml(name)} 様</p>
        <p>1分チェックにご回答いただき、ありがとうございます。結果は以下のとおりです。</p>
        <p><strong>スコア：</strong>${escapeHtml(score)}</p>
        <p><strong>結果：</strong>${escapeHtml(tier)}</p>
        <p>${escapeHtml(tierComment(tier))}</p>
        ${kind === 'corporate' ? NEXT_STEP_CORPORATE : NEXT_STEP_PERSONAL}
        ${SIGNATURE}
      `,
    });
    if (!autoReply.ok) console.error('Auto-reply error:', await autoReply.text());

    // メールの受け取りに同意した人だけ、Resendの自動配信（5日間のメール）を開始する
    // 5日間メールは法人向けの内容のため、個人には送らない（個人向けの内容ができたら分ける）
    if (optin && kind === 'corporate') {
      const ev = await fetch('https://api.resend.com/events/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event: 'diagnosis.completed',
          email,
          payload: { company, name, tier, score, ...day1Paragraphs(tier) },
        }),
      });
      if (!ev.ok) console.error('Automation event error:', await ev.text());
    }
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


// 5日間メールの1日目は、診断結果の段階ごとに本文を変える。
// Resendの条件分岐を使わずに済むよう、段落をイベントに乗せて送る（テンプレート側では d1_1〜d1_7 で受け取る）
const DAY1: Record<string, string[]> = {
  '内容以前で、評価を下げている可能性がある状態': [
    'この段階の会社でよく起きているのは、こういう場面です。',
    '提案書はよくできている。でも、商談に来た社員のシャツの襟が黄ばんでいる。相手は、資料を開く前に「この会社は大丈夫か」と感じています。',
    '悪い知らせではありません。この段階は、一番早く結果が出る段階です。',
    '今日できることを、1つだけお伝えします。',
    '明日、顧客と会う予定の社員を1人選び、出かける前に、全身を1分だけ見てください。襟、袖口、靴、髪。「汚れ・しわ・乱れがないか」だけを確認します。',
    '好みは入れません。事実だけを見ます。これだけで、減点の多くは防げます。',
    '明日からの4日間、なぜ実力のある社員ほどこの段階で損をしているのかを、短いメールでお送りします。',
  ],
  '悪くはないが、記憶に残っていない状態': [
    '多くの会社が、この段階にいます。',
    '身だしなみに問題はない。失礼もない。でも、商談が終わった3日後に相手が貴社の担当者の名前を思い出せない。',
    '減点はない。でも、選ばれる理由にもなっていない。それがこの段階です。',
    '今日できることを、1つだけお伝えします。',
    '次の会議で、発言する社員を1人見てください。話し始める前に、資料ではなく相手の顔を見ているか。話し終えたあと、すぐに目をそらしていないか。',
    'この2つだけで、同じ発言でも「聞くべき話」として受け取られるかが変わります。',
    '明日からの4日間、この段階から抜け出した会社が何を変えたのかを、短いメールでお送りします。',
  ],
  '一部の社員では「任せたい」が生まれている状態': [
    '貴社には、取引先から名指しで指名される社員が何人かいるはずです。',
    'ただ、その人が異動したら、どうなるでしょうか。',
    'その社員の「任せたい」と思わせる振る舞いは、本人の資質のままで、ほかの社員に受け継がれていません。',
    '今日できることを、1つだけお伝えします。',
    'その社員が商談や会議で、ほかの社員と何が違うかを、3つ書き出してください。「感じがいい」ではなく、「話す前に一拍おく」「最初に結論を言う」のように、誰が見ても同じ判断ができる言葉で書きます。',
    'その3つが、貴社の基準の最初の一行になります。',
    '明日からの4日間、一人の資質を会社の力に変えるための話を、短いメールでお送りします。',
  ],
  '組織として機能している状態': [
    '提案の中身を説明する前に、信頼が生まれている。多くの会社が目指している段階です。',
    'この段階の会社が気をつけるべきことは、1つです。今の状態が、暗黙のうちに保たれていること。',
    '基準が言葉になっていないと、中心にいる人が異動したり、新しい人が増えたりしたときに、驚くほど早く崩れます。',
    '今日できることを、1つだけお伝えします。',
    'この1年で入社した社員を1人選び、「うちの会社で、商談の場でやってはいけないこと」を聞いてみてください。',
    '答えが先輩社員と揃っていれば、基準は受け継がれています。',
    '明日からの4日間、この状態を保ち続けるための話を、短いメールでお送りします。',
  ],
};

function day1Paragraphs(tier: string): Record<string, string> {
  const key = Object.keys(DAY1).find((k) => tier.includes(k.slice(0, 8))) ?? '悪くはないが、記憶に残っていない状態';
  const out: Record<string, string> = {};
  DAY1[key].forEach((t, i) => (out[`d1_${i + 1}`] = t));
  return out;
}

// 診断結果メールで、結果の下に添える一言
const TIER_COMMENT: Record<string, string> = {
  '内容以前で、評価を下げている可能性がある状態':
    '提案の中身を見てもらう前に、見た目で減点されている可能性があります。ただし、一番早く変われる段階でもあります。',
  '悪くはないが、記憶に残っていない状態':
    '減点はありません。ただ、選ばれる理由にもなっていません。商談の3日後、相手は貴社の担当者の名前を覚えているでしょうか。',
  '一部の社員では「任せたい」が生まれている状態':
    '貴社の評価は、一部の社員の属人的な力に支えられています。その人が異動したとき、同じように取引してもらえるかどうかが分かれ目です。',
  '組織として機能している状態':
    '信頼が生まれる状態ができています。気をつけたいのは、会社としてのスタンダードができていないと、人が入れ替わったときに崩壊することです。',
  '中身を見てもらう前に、損をしている可能性がある状態':
    '実力や話の中身を見てもらう前に、見た目で判断されている可能性があります。ただし、一番早く変われる段階でもあります。まずはスーツのサイズを体に合わせて直すところから始めてください。',
  '失礼ではないが、印象に残っていない状態':
    '失点はありません。でも、周りと同じ服装で、相手の記憶に残っていない状態です。似合う色、体型に合う形、印象を決める1点を選べるようになると、ここから抜け出せます。',
  '場面によっては、一目置かれている状態':
    '一目置かれる場面はありますが、まだ安定していません。服装だけでなく、姿勢、声、話し始めの間まで含めて、どの場面でも同じプレゼンスを出せるようにする段階です。',
  '見た目と振る舞いで、信頼が生まれている状態':
    '話の中身を説明する前に、信頼が生まれています。役職や場面が変わったときに、それに見合ったプレゼンスへ合わせ直していくことが、次の課題です。',
};

function tierComment(tier: string): string {
  return TIER_COMMENT[tier] ?? '';
}
