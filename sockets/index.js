"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const ws_1 = require("ws");
const utils_1 = require("../utils");
const HEARTBEAT_INTERVAL = 1000 * 5; // 5 seconds
const HEARTBEAT_VALUE = 1;
const clients = {
    threads: {},
    // scoring: {},
};
function onSocketPreError(e) {
    console.log(e);
}
function onSocketPostError(e) {
    console.log(e);
}
function ping(ws) {
    ws.send(HEARTBEAT_VALUE, { binary: true }); //authentication and authorisation code
}
function sendAll(ws, wss) {
    ws.on('message', (msg, isBinary) => {
        if (isBinary && msg.length === 1 && msg[0] === HEARTBEAT_VALUE) {
            // console.log('pong');
            ws.isAlive = true;
        }
        else {
            wss.clients.forEach((client) => {
                if (client.readyState === ws_1.WebSocket.OPEN) {
                    client.send(msg, { binary: isBinary });
                }
            });
        }
    });
    ws.on('close', () => {
        console.log('Connection closed');
    });
}
function sendThread(ws, threadid) {
    if (!threadid) {
        ws.on('close', () => {
            console.log('Connection closed');
        });
        return;
    }
    const threads = clients.threads;
    if (!threads[threadid]) {
        threads[threadid] = [ws];
    }
    else {
        threads[threadid].push(ws);
    }
    ws.on('message', (msg, isBinary) => {
        if (isBinary && msg.length === 1 && msg[0] === HEARTBEAT_VALUE) {
            // console.log('pong');
            ws.isAlive = true;
        }
        else {
            threads[threadid].forEach((client) => {
                if (client.readyState === ws_1.WebSocket.OPEN) {
                    client.send(msg, { binary: isBinary });
                }
            });
        }
    });
    ws.on('close', () => {
        console.log('Connection closed');
        const idx = threads[threadid].indexOf(ws);
        if (idx >= 0) {
            threads[threadid].splice(idx, 1);
            if (threads[threadid].length === 0) {
                delete threads[threadid];
            }
        }
    });
}
function configure(s) {
    const wss = new ws_1.WebSocketServer({ noServer: true });
    s.on('upgrade', (req, socket, head) => {
        socket.on('error', onSocketPreError);
        // perform auth
        (0, cookie_parser_1.default)(utils_1.COOKIE_SECRET)(req, {}, () => {
            const signedCookies = req.signedCookies;
            let at = signedCookies[utils_1.AT_KEY];
            if (!at && !!req.url) {
                const url = new URL(req.url, `ws://${req.headers.host}`);
                at = url.searchParams.get('at');
            }
            if (!(0, utils_1.validToken)(at)) {
                socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                socket.destroy();
                return;
            }
            wss.handleUpgrade(req, socket, head, (ws) => {
                socket.removeListener('error', onSocketPreError);
                wss.emit('connection', ws, req);
            });
        });
    });
    wss.on('connection', (ws, req) => {
        ws.isAlive = true;
        ws.on('error', onSocketPostError);
        if (!req.url) {
            sendAll(ws, wss);
        }
        else {
            const idx = req.url.indexOf('?');
            const uri = idx >= 0 ? req.url.slice(0, idx) : req.url;
            const paths = uri.split('/').filter((p) => !!p);
            switch (paths[0]) {
                case 'thread':
                    sendThread(ws, paths[1]);
                    break;
                default:
                    sendAll(ws, wss);
                    break;
            }
        }
    });
    const interval = setInterval(() => {
        // console.log('firing interval'); Api-v
        wss.clients.forEach((client) => {
            if (!client.isAlive) {
                client.terminate();
                return;
            }
            client.isAlive = false;
            ping(client);
        });
    }, HEARTBEAT_INTERVAL); //authentication code ends here
    wss.on('close', () => {
        clearInterval(interval);
    });
}
exports.default = configure;
