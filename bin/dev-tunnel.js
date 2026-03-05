import { spawn } from 'child_process';

const SERVE_PORT = 3000;

// Start the dev server
const dev = spawn('node', ['./bin/build.js'], {
  env: { ...process.env, NODE_ENV: 'development' },
  stdio: 'inherit',
});

// Give the dev server a moment to start, then launch the tunnel
setTimeout(() => {
  const tunnel = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${SERVE_PORT}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let urlPrinted = false;

  const handleOutput = (data) => {
    const text = data.toString();

    // cloudflared logs the tunnel URL to stderr
    if (!urlPrinted) {
      const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match) {
        urlPrinted = true;
        const url = match[0];
        console.log('\n' + '='.repeat(60));
        console.log('🌍  Tunnel is live!');
        console.log(`📡  ${url}`);
        console.log('');
        console.log('Add this to your site:');
        console.log(`  <script defer src="${url}/index.js"><\/script>`);
        console.log('='.repeat(60) + '\n');
      }
    }
  };

  tunnel.stdout.on('data', handleOutput);
  tunnel.stderr.on('data', handleOutput);

  tunnel.on('error', (err) => {
    console.error('Failed to start cloudflared tunnel:', err.message);
    console.error('Make sure cloudflared is installed: brew install cloudflared');
  });

  // Clean up on exit
  const cleanup = () => {
    tunnel.kill();
    dev.kill();
    process.exit();
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  dev.on('close', () => {
    tunnel.kill();
    process.exit();
  });

  tunnel.on('close', () => {
    console.log('\n🔌 Tunnel closed.');
  });
}, 1500);
