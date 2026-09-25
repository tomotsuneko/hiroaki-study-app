const http = require('http');

const data = JSON.stringify({
  profile: {
    targetSchools: ["日本大学 (理工学部)", "東洋大学 (理工学部)"],
    weakSubjects: ["数学III", "物理"]
  }
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/cron/daily',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => console.log('Response:', body));
});

req.on('error', error => console.error(error));
req.write(data);
req.end();
