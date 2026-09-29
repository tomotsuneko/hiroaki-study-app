import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

export const maxDuration = 60; // Increase Vercel timeout to 60 seconds

const getBaseSubject = (filename: string) => {
  if (filename.includes('国語')) return '国語';
  if (filename.includes('数学')) return '数学';
  if (filename.includes('英語')) return '英語';
  if (filename.includes('理科') || filename.includes('物理') || filename.includes('化学') || filename.includes('生物') || filename.includes('地学')) return '理科';
  if (filename.includes('社会') || filename.includes('歴史') || filename.includes('地理') || filename.includes('公民') || filename.includes('日本史') || filename.includes('世界史') || filename.includes('政治・経済')) return '社会';
  if (filename.includes('情報')) return '情報';
  return 'その他';
};

export async function POST(req: Request) {
  try {
    const dir = path.join(process.cwd(), 'src', 'data', 'master_curriculum');
    if (!fs.existsSync(dir)) {
      throw new Error(`Directory not found: ${dir}`);
    }

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md') && f !== '00_一覧.md');
    
    // subjectName -> largeCategories array
    const dbData: Record<string, any> = {};

    for (const file of files) {
      const content = fs.readFileSync(path.join(dir, file), 'utf-8');
      const baseSubj = getBaseSubject(file);
      
      if (!dbData[baseSubj]) {
        dbData[baseSubj] = { subjectName: baseSubj, largeCategories: [] };
      }
      
      const lines = content.split('\n');
      let currentLarge: any = null;
      let currentMedium: any = null;
      let inTable = false;
      
      for (const line of lines) {
        // Exclude lines like "## 1. 読み方" or "## 2. 根拠資料"
        if (line.startsWith('## ') && !line.match(/^##\s+[0-9]+\./)) {
          let title = line.replace('## ', '').trim();
          title = title.split('（')[0].trim();
          currentLarge = { name: title, mediumCategories: [] };
          dbData[baseSubj].largeCategories.push(currentLarge);
          currentMedium = null;
          inTable = false;
        } else if (line.startsWith('### ')) {
          let title = line.replace('### ', '').trim();
          title = title.split('（')[0].trim();
          currentMedium = { name: title, smallCategories: [] };
          if (currentLarge) {
            currentLarge.mediumCategories.push(currentMedium);
          }
          inTable = false;
        } else if (line.startsWith('|')) {
          if (line.includes('| ID |') || line.includes('|---|')) {
            inTable = true;
            continue;
          }
          if (inTable && currentMedium) {
            const parts = line.split('|');
            // format: | ID | 学年・科目 | 小項目（1コマ） | 区分 | 学習内容の要点 | ...
            // parts[0] is empty, parts[1] is ID, parts[2] is 学年, parts[3] is 小項目
            if (parts.length > 3) {
              const smallItem = parts[3].trim();
              if (smallItem && smallItem !== '') {
                currentMedium.smallCategories.push(smallItem);
              }
            }
          }
        } else {
          if (line.trim() === '') {
            inTable = false;
          }
        }
      }
    }

    if (!dbAdmin) {
      throw new Error('Firebase Admin DB is not initialized');
    }

    const batch = dbAdmin.batch();
    const resultData = [];
    
    for (const baseSubj of Object.keys(dbData)) {
      const subjectData = dbData[baseSubj];
      const docRef = dbAdmin.collection('curriculum_db').doc(baseSubj);
      batch.set(docRef, {
        updatedAt: new Date().toISOString(),
        ...subjectData
      });
      resultData.push(subjectData);
    }
    
    await batch.commit();

    return NextResponse.json({ success: true, result: resultData, message: `Successfully imported ${files.length} curriculum files.` });
  } catch (error: any) {
    console.error('Syllabus Import Error:', error);
    return NextResponse.json({ error: 'Failed to import syllabus: ' + error.message }, { status: 500 });
  }
}
