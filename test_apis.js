const http = require('http');

async function testAPIs() {
  console.log("Starting API validation tests...");
  
  const fetchLocal = async (path, options = {}) => {
    try {
      const res = await fetch(`http://localhost:3000${path}`, options);
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch(e) { data = text; }
      return { status: res.status, data };
    } catch (e) {
      return { error: e.message };
    }
  };

  const profile = {
    name: 'テスト生徒',
    targetSchools: ['日大'],
    weakSubjects: ['現代文'],
    tutorPersona: '熱血',
    currentMood: '普通'
  };

  // 1. GET /api/db/daily
  console.log("\n[1] Testing /api/db/daily GET");
  const dbRes = await fetchLocal('/api/db/daily');
  console.log("Status:", dbRes.status);
  console.log("Has studyTime:", dbRes.data && typeof dbRes.data.studyTime === 'number');

  // 2. POST /api/db/daily (Update Study Time)
  console.log("\n[2] Testing /api/db/daily POST (Pomodoro completion)");
  const pRes = await fetchLocal('/api/db/daily', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ focusMinutes: 25 })
  });
  console.log("Status:", pRes.status);
  console.log("Response:", pRes.data);

  // 3. POST /api/flashcard
  console.log("\n[3] Testing /api/flashcard POST");
  const fRes = await fetchLocal('/api/flashcard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subjects: ['現代文漢字'], targetSchools: ['日大'] })
  });
  console.log("Status:", fRes.status);
  console.log("Is Array?:", Array.isArray(fRes.data));
  if (Array.isArray(fRes.data) && fRes.data.length > 0) {
    console.log("Sample Card:", fRes.data[0]);
  } else {
    console.log("Data:", fRes.data);
  }

  // 4. POST /api/drill
  console.log("\n[4] Testing /api/drill POST");
  const dRes = await fetchLocal('/api/drill', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subject: '古文単語', profile })
  });
  console.log("Status:", dRes.status);
  console.log("Is Array?:", Array.isArray(dRes.data));
  if (Array.isArray(dRes.data) && dRes.data.length > 0) {
    console.log("Sample Question:", dRes.data[0].question.substring(0, 50) + "...");
  } else {
    console.log("Data:", dRes.data);
  }

  console.log("\nTests complete.");
}

testAPIs();
