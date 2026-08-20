import http from 'node:http';

export function startHealthServer({ port, client, store, callbacks }) {
  const server = http.createServer(async (request, response) => {
    try {
      if (callbacks && await callbacks.handleRequest(request, response)) return;

      if (request.url !== '/' && request.url !== '/health') {
        response.writeHead(404, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ ok: false, error: 'Not found' }));
        return;
      }

      const ready = client.isReady();
      response.writeHead(ready ? 200 : 503, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          ok: ready,
          discordReady: ready,
          guilds: client.guilds.cache.size,
          configuredGuilds: store.count(),
          uptimeSeconds: Math.floor(process.uptime()),
        }),
      );
    } catch (error) {
      console.error('[http] Request failed:', error);
      if (!response.writableEnded) {
        response.writeHead(500, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ ok: false, error: 'Internal error' }));
      }
    }
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`[health] Listening on port ${port}`);
  });

  return server;
}
