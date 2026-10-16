import { getActiveModels } from '@/lib/model-manager';
import { NextResponse } from 'next/server';
import { genAI } from '@/lib/gemini';
import { dbAdmin } from '@/lib/firebase-admin';

function stripHtmlForContext(html: string): string {
  if (!html) return '';
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2500);
}

export async function POST(req: Request) {
  try {
    const {
      subject = '数学',
      topic = '',
      unitCode = '',
      mode = 'unit', // 'unit' | 'weakness' | 'comprehensive' | 'diagnostic'
      difficulty = '標準', // '基礎' | '標準' | '応用'
      questionCount = 5,
      profile,
    } = await req.json();

    const userName = profile?.name || '生徒';
    const targetSchools =
      profile?.targetSchools?.length > 0
        ? profile.targetSchools.join('、')
        : '難関私大・国公立大学';
    const count = Math.min(Math.max(Number(questionCount) || 5, 3), 8);

    // 既存の学習コンテンツ（learning_materials）があればコンテキストとして抽出
    let materialContext = '';
    if (dbAdmin && (unitCode || topic)) {
      try {
        if (unitCode) {
          const doc = await dbAdmin.collection('learning_materials').doc(unitCode).get();
          if (doc.exists) {
            materialContext = stripHtmlForContext(doc.data()?.content || '');
          }
        }
        if (!materialContext && topic) {
          const snap = await dbAdmin
            .collection('learning_materials')
            .where('contentTitle', '==', topic)
            .limit(1)
            .get();
          if (!snap.empty) {
            materialContext = stripHtmlForContext(snap.docs[0].data()?.content || '');
          }
        }
      } catch (e) {
        console.warn('Optional material context fetch skipped:', e);
      }
    }

    let modeInstruction = '';
    if (mode === 'diagnostic') {
      modeInstruction = `【出題モード：学力レベル診断テスト】
- 生徒の現在の実力（偏差値40〜68相当）を正確に測定するため、以下の難易度グラデーションで全${count}問を構成してください：
  - 第1問〜第2問：基礎レベル（教科書基本・偏差値45相当）
  - 第3問〜第4問：標準レベル（共通テスト・中堅大標準・偏差値55相当）
  - 第5問：発展・応用レベル（難関大入試標準・偏差値63〜65相当）`;
    } else if (mode === 'comprehensive') {
      modeInstruction = `【出題モード：模試・実戦総合テスト形式】
- 定期試験や大学入学共通テスト・模試を意識し、「${subject}${topic ? `（${topic}）` : ''}」の重要単元を横断する実戦的な総合問題（全${count}問）を作成してください。
- 単なる一問一答ではなく、誘導付きの問題や思考力を問う実戦的な良問を含めてください。`;
    } else if (mode === 'weakness') {
      modeInstruction = `【出題モード：弱点克服・つまずき解消ドリル】
- 生徒が「${subject}${topic ? ` / ${topic}` : ''}」でつまずきやすい急所・典型的な誤答パターンを克服できるよう、基礎概念の確認から標準問題への橋渡しとなる良問（全${count}問）を作成してください。`;
    } else {
      modeInstruction = `【出題モード：単元別ピンポイント演習（難易度：${difficulty}）】
- 科目「${subject}」${topic ? `の単元「${topic}」` : ''}に焦点を当て、難易度「${difficulty}」の王道良問（全${count}問）を作成してください。`;
    }

    const systemInstruction = `あなたは超一流の進学予備校講師・AI家庭教師です。
生徒（${userName}、目標校：${targetSchools}）のために、実践的な演習テスト・ドリル問題を生成します。

${modeInstruction}

${
  materialContext
    ? `【公式学習テキスト（教材DB）の参照内容】
以下の公式教材で扱われている定義・公式・例題の観点を踏まえて、教材の学習内容がしっかり定着する問題を作成してください：
"""
${materialContext}
"""`
    : ''
}

【ハルシネーション（嘘の出力）対策の厳守事項】
- 数学や理科の問題を生成する際は、計算結果が正確に求まるように設定してください。架空の法則や間違った公式を絶対に使用しないでください。
- 英語の問題では、実在する文法規則と自然な表現のみを使用してください。
- 知識が不確実な奇問は避け、必ず市販の定番参考書や模試に載っているような「王道の良問」を生成してください。

フォーマットは必ず以下のJSON配列形式のみを出力してください。それ以外のテキストは一切含めないでください。

[
  {
    "id": 1,
    "level": "基礎 または 標準 または 応用",
    "unit": "該当する単元名（例: 二次関数の最大・最小）",
    "question": "問題文をマークダウン（数式はLaTeXの$や$$を使用）で記述",
    "hint": "問題を解くための着眼点・ヒント",
    "answer": "模範解答とステップバイステップの詳しい解説",
    "keyPoint": "この問題で覚えるべき最重要公式・定理・急所（暗記カード化しやすい1〜2文）"
  }
]`;

    const modelsToTry = await getActiveModels('chat');
    let text = '';
    let success = false;

    const userPrompt = topic
      ? `科目「${subject}」、単元・テーマ「${topic}」（モード：${mode}、難易度：${difficulty}）の問題を${count}問作成してください。`
      : `科目「${subject}」（モード：${mode}、難易度：${difficulty}）の問題を${count}問作成してください。`;

    for (const modelName of modelsToTry) {
      if (success) break;
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction,
          generationConfig: {
            responseMimeType: 'application/json',
          },
        });

        const result = await model.generateContent(userPrompt);
        const response = await result.response;
        text = response.text();
        success = true;
      } catch (err: any) {
        console.warn(`Drill model ${modelName} failed.`);
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    }

    if (!success) {
      throw new Error('All Gemini models failed for Drill generation.');
    }

    return NextResponse.json(JSON.parse(text));
  } catch (error: any) {
    console.error('Drill API Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate drill questions.' },
      { status: 500 }
    );
  }
}
