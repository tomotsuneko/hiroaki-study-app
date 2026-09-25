const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(process.cwd(), 'data', 'db.json');

try {
  if (fs.existsSync(DB_PATH)) {
    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    if (data.dailyAnalysis) {
      if (data.dailyAnalysis.learningContent) {
        delete data.dailyAnalysis.learningContent;
      }
      data.dailyAnalysis.learningContents = [
        {
          taskTitle: "英文法：五文型の基礎",
          textMarkdown: "五文型の基礎をマスターすることは、長文読解の土台となります。SVO, SVCなどの構造を理解しましょう。\n\n**1. SVCの構造**\nS = C の関係が成り立ちます。\n\n**2. SVOの構造**\nS ≠ O の関係です。",
          videoQueries: ["英語 五文型 基礎", "英語 SVOC"],
          checkTest: [{
            question: "SVC文型のC（補語）になれる品詞は？",
            options: ["名詞・形容詞", "動詞", "副詞", "前置詞"],
            correctIndex: 0,
            explanation: "補語になれるのは名詞か形容詞です。"
          }]
        },
        {
          taskTitle: "数学：二次関数の最大最小",
          textMarkdown: "二次関数の最大・最小問題は、**平方完成して頂点を求める**ことが第一歩です。\n\n次に、定義域と軸の位置関係（定義域に軸が含まれるか、左右どちらにあるか）で場合分けを行います。",
          videoQueries: ["二次関数 最大 最小 場合分け"],
          checkTest: [{
            question: "y = (x-2)^2 + 3 の頂点の座標は？",
            options: ["(2, 3)", "(-2, 3)", "(2, -3)", "(-2, -3)"],
            correctIndex: 0,
            explanation: "平方完成された形 y = a(x-p)^2 + q の頂点は (p, q) です。"
          }]
        }
      ];
      fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
      console.log('Fixed db.json by adding learningContents array!');
    }
  }
} catch (e) {
  console.error(e);
}
