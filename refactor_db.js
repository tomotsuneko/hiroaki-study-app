const fs = require('fs');
const path = require('path');

const API_DIR = path.join(process.cwd(), 'src/app/api');
const DB_FILE = path.join(process.cwd(), 'src/lib/db.ts');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    const dirPath = path.join(dir, f);
    const isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(dirPath);
  });
}

walkDir(API_DIR, (filePath) => {
  if (filePath.endsWith('.ts')) {
    let content = fs.readFileSync(filePath, 'utf-8');
    
    // Add awaits to db calls
    content = content.replace(/addLog\(/g, 'await addLog(');
    content = content.replace(/getLogs\(\)/g, 'await getLogs()');
    content = content.replace(/getDailyAnalysis\(\)/g, 'await getDailyAnalysis()');
    content = content.replace(/updateDailyAnalysis\(/g, 'await updateDailyAnalysis(');
    content = content.replace(/addStudyTime\(/g, 'await addStudyTime(');
    content = content.replace(/getStudyTime\(\)/g, 'await getStudyTime()');
    content = content.replace(/getSyllabus\(\)/g, 'await getSyllabus()');
    content = content.replace(/updateSyllabus\(/g, 'await updateSyllabus(');
    content = content.replace(/getFlashcards\(\)/g, 'await getFlashcards()');
    content = content.replace(/saveFlashcards\(/g, 'await saveFlashcards(');
    content = content.replace(/updateFlashcardReview\(/g, 'await updateFlashcardReview(');
    
    // Deduplicate await if it became `await await addLog`
    content = content.replace(/await\s+await\s+/g, 'await ');
    
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log('Refactored:', filePath);
  }
});
