import http from 'node:http';

export function startHealthServer({ port, client, store }) {
  const server = http.createServer((request, response) => {
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
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`[health] Listening on port ${port}`);
  });

  return server;
}
