import http from 'http';
import { promises as fs } from 'fs';
import path from 'path';

const collectBody = async (req: http.IncomingMessage): Promise<string> => {
    return new Promise((resolve) => {
        if (req.method !== 'POST') {
            resolve('');
            return;
        }
        let body = "";
        req.on("data", function (chunk) {
            body += chunk;
        });

        req.on("end", function(){
            resolve(body);
        });
    })
}

export type HandlerRef = {
    current: Function
}

export const startDevServer = (handlerRef: HandlerRef) => {
    const server = http.createServer(async (req, res) => {
        if (req.method === 'GET' && req.url === '/graphiql') {
            const file = await fs.readFile(path.resolve(__dirname, '..', 'resources', 'graphiql.html'), { encoding: 'utf-8' });
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(file);
            return;
        }

        const body = await collectBody(req);
        const results = await handlerRef.current({
            httpMethod: req.method,
            path: req.url,
            headers: {
                "content-type": "application/json"
            },
            requestContext: {},
            body,
        });
        res.writeHead(results.statusCode, results.multiValueHeaders);
        res.end(results.body);
        return;
    });

    server.listen(8000, '0.0.0.0', () => {
        console.log("Started")
    }); 
}