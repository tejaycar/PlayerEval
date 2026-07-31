import http from 'http';
import { handler } from './handlers/api';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

const PORT = process.env.PORT || 3001;

const server = http.createServer(async (req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', async () => {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);
    
    const event: APIGatewayProxyEventV2 = {
      version: '2.0',
      routeKey: `${req.method} ${url.pathname}`,
      rawPath: url.pathname,
      rawQueryString: url.search.slice(1),
      headers: req.headers as Record<string, string>,
      queryStringParameters: Object.fromEntries(url.searchParams),
      requestContext: {
        accountId: 'local',
        apiId: 'local',
        domainName: 'localhost',
        domainPrefix: 'localhost',
        http: {
          method: req.method || 'GET',
          path: url.pathname,
          protocol: 'HTTP/1.1',
          sourceIp: '127.0.0.1',
          userAgent: req.headers['user-agent'] || '',
        },
        requestId: 'local',
        routeKey: `${req.method} ${url.pathname}`,
        stage: '$default',
        time: new Date().toISOString(),
        timeEpoch: Date.now(),
      },
      body: body || undefined,
      isBase64Encoded: false,
    };

    try {
      const result = await handler(event);
      const statusCode = typeof result === 'object' && 'statusCode' in result ? result.statusCode || 200 : 200;
      const headers = typeof result === 'object' && 'headers' in result ? (result.headers as Record<string, string>) : {};
      const responseBody = typeof result === 'object' && 'body' in result ? result.body : '';

      res.writeHead(statusCode, headers);
      res.end(responseBody);
    } catch (error) {
      console.error('Handler error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`Local API server running on http://localhost:${PORT}`);
});
