import http from 'http';
const data = JSON.stringify({
  message: "Halo",
  history: [],
  userName: "TestUser",
  botName: "vimos.ai"
});
const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/ai/chat',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};
const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (d) => body += d);
  res.on('end', () => console.log(body));
});
req.on('error', (e) => console.error(e));
req.write(data);
req.end();
