const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

const MIME = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.gpx': 'application/gpx+xml'
};

const server = http.createServer((req, res) => {
    if (req.url === '/track' || req.url === '/track/') {
        const file = fs.readFileSync(path.join(__dirname, 'tracker.html'));
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(file);
        return;
    }

    let filePath = req.url === '/' ? '/index.html' : req.url;
    filePath = path.join(__dirname, filePath);

    const ext = path.extname(filePath);
    const mime = MIME[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }
        res.writeHead(200, { 'Content-Type': mime });
        res.end(data);
    });
});

const wss = new WebSocketServer({ server });

let latestPosition = null;

wss.on('connection', (ws, req) => {
    const isTracker = req.url && req.url.startsWith('/track');
    const role = isTracker ? 'tracker' : 'map';
    console.log(`[+] ${role} connected (total: ${wss.clients.size})`);

    if (!isTracker && latestPosition) {
        ws.send(JSON.stringify(latestPosition));
    }

    ws.on('message', (raw) => {
        try {
            const msg = JSON.parse(raw);
            if (msg.type === 'position') {
                latestPosition = msg;
                for (const client of wss.clients) {
                    if (client !== ws && client.readyState === 1) {
                        client.send(JSON.stringify(msg));
                    }
                }
            }
        } catch (e) {
            console.error('Bad message:', e.message);
        }
    });

    ws.on('close', () => {
        console.log(`[-] ${role} disconnected (total: ${wss.clients.size})`);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  Live Map Server running:`);
    console.log(`  Map:    http://localhost:${PORT}`);
    console.log(`  Phone:  http://localhost:${PORT}/track\n`);
});
