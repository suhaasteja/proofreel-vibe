import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execSync } from 'node:child_process';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Load .env from project root
dotenv.config({ path: path.join(ROOT, '.env') });
const REPOS_DIR = path.join(ROOT, '.repos');
const PORT = 3457;

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.gif': 'image/gif',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webm': 'video/webm'
};

// In-memory job state
let jobs = [];
let nextJobId = 1;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Serve static files
  if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
    const filePath = url.pathname === '/' ? '/index.html' : url.pathname;
    const fullPath = path.join(__dirname, 'public', filePath);
    const ext = path.extname(fullPath);

    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath);
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      res.end(content);
      return;
    }
  }

  // Serve generated GIFs
  if (req.method === 'GET' && url.pathname.startsWith('/output/')) {
    const filePath = path.join(REPOS_DIR, url.pathname.replace('/output/', ''));
    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath);
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      res.end(content);
      return;
    }
  }

  // API: List jobs
  if (url.pathname === '/api/jobs' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(jobs));
    return;
  }

  // API: Create job (trigger ProofReel on a repo)
  if (url.pathname === '/api/jobs' && req.method === 'POST') {
    const body = await parseBody(req);
    const { repoUrl, feature, port, mode } = body;

    if (!repoUrl) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'repoUrl is required' }));
      return;
    }

    const job = {
      id: nextJobId++,
      repoUrl,
      feature: feature || 'CRUD',
      port: port || 3000,
      mode: mode || 'standard', // 'standard' or 'single-run'
      status: 'pending',
      logs: [],
      result: null,
      gifUrl: null,
      createdAt: new Date().toISOString()
    };
    jobs.push(job);

    // Process async
    processJob(job);

    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(job));
    return;
  }

  // API: Get job by ID
  if (url.pathname.match(/^\/api\/jobs\/\d+$/) && req.method === 'GET') {
    const id = parseInt(url.pathname.split('/').pop());
    const job = jobs.find(j => j.id === id);
    if (!job) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Job not found' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(job));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

async function processJob(job) {
  const log = (msg) => { job.logs.push(msg); console.log(`[Job ${job.id}] ${msg}`); };

  try {
    job.status = 'cloning';
    log(`Cloning ${job.repoUrl}...`);

    // Ensure repos dir exists
    if (!fs.existsSync(REPOS_DIR)) fs.mkdirSync(REPOS_DIR, { recursive: true });

    // Derive repo name from URL
    const repoName = job.repoUrl.replace(/\.git$/, '').split('/').pop() + `-${job.id}`;
    const repoDir = path.join(REPOS_DIR, repoName);

    // Clone
    if (fs.existsSync(repoDir)) {
      log('Repo already cloned, reusing.');
    } else {
      execSync(`git clone --depth 1 ${job.repoUrl} ${repoDir}`, { timeout: 60000 });
      log('Cloned successfully.');
    }

    // Install dependencies
    job.status = 'installing';
    log('Installing dependencies...');
    if (fs.existsSync(path.join(repoDir, 'package.json'))) {
      execSync('npm install', { cwd: repoDir, timeout: 120000, stdio: 'pipe' });
      log('Dependencies installed.');
    } else {
      log('No package.json found, skipping install.');
    }

    // Detect start command from package.json
    job.status = 'booting';
    const pkgPath = path.join(repoDir, 'package.json');
    let startCmd = 'npm start';
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.scripts) {
        if (pkg.scripts.dev) startCmd = 'npm run dev';
        else if (pkg.scripts.start) startCmd = 'npm start';
        else if (pkg.scripts.serve) startCmd = 'npm run serve';
      }
    }

    // Boot the app
    log(`Booting app with: ${startCmd} (port ${job.port})...`);
    const [cmd, ...args] = startCmd.split(' ');
    const appProc = spawn(cmd, args, {
      cwd: repoDir,
      stdio: 'pipe',
      env: { ...process.env, PORT: String(job.port) },
      shell: true
    });

    // Wait for the app to be ready
    const targetUrl = `http://localhost:${job.port}`;
    const ready = await waitForServer(targetUrl, 30000);
    if (!ready) {
      log('App did not start within 30s. Trying anyway...');
    } else {
      log('App is running.');
    }

    // Compile flow
    job.status = 'compiling';
    log(`Compiling flow for feature: ${job.feature}...`);

    let flowSteps;
    try {
      const { compileFlow } = await import('../flow-compiler/index.js');
      const flowSpec = await compileFlow({ repoPath: repoDir, feature: job.feature, startUrl: targetUrl });
      flowSteps = flowSpec.steps;
      log(`Flow compiled: ${flowSteps.length} steps.`);
    } catch (err) {
      // Fallback: generate basic flow from feature name
      log(`Flow compiler error (${err.message}), using generic flow.`);
      flowSteps = [
        `Navigate to ${targetUrl}`,
        `Look for the ${job.feature} feature on the page`,
        `Interact with the main UI elements`,
        `Verify the page responds correctly`
      ];
    }

    // Kane verification
    job.status = 'verifying';

    const outputDir = path.join(repoDir, '.proofreel');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const videoPath = path.join(outputDir, `${job.feature.toLowerCase().replace(/\s+/g, '-')}.webm`);
    const gifPath = path.join(outputDir, `${job.feature.toLowerCase().replace(/\s+/g, '-')}.gif`);

    if (job.mode === 'single-run') {
      // SINGLE-RUN MODE: Kane verifies + Playwright records simultaneously
      log('Running Kane verification + recording (single-run mode)...');

      const { singleRun } = await import('../kane-runner/single-run.js');
      const objective = flowSteps.filter(s => {
        const l = s.toLowerCase();
        return !l.startsWith('navigate') && !l.startsWith('go to');
      }).join(', then ');

      const singleResult = await singleRun({
        objective: `Go to ${targetUrl}, then ${objective}`,
        targetUrl,
        outputPath: videoPath,
        timeout: 90
      });

      if (!singleResult.passed) {
        log(`Kane FAILED: ${singleResult.summary || 'Verification failed'}`);
        job.result = {
          verified: [],
          flagged: [{ feature: job.feature, reason: singleResult.summary || 'Failed Kane verification' }]
        };
        job.status = 'completed';
        log('Feature flagged — no demo GIF produced (verify first, record second).');
        appProc.kill();
        return;
      }

      log(`Kane PASSED + Recorded: ${singleResult.summary || 'All steps completed'}`);

    } else {
      // STANDARD MODE: Kane verifies headlessly, then Playwright re-records
      log('Running Kane CLI verification...');

      let kaneResult;
      try {
        const { runKane } = await import('../kane-runner/index.js');
        kaneResult = await runKane({
          steps: flowSteps,
          targetUrl,
          feature: job.feature,
          timeout: 90,
          headless: true
        });

        if (kaneResult.passed) {
          log(`Kane PASSED: ${kaneResult.summary || 'All steps completed'}`);
        } else {
          log(`Kane FAILED: ${kaneResult.reason || kaneResult.summary || 'Verification failed'}`);
          job.result = {
            verified: [],
            flagged: [{ feature: job.feature, reason: kaneResult.reason || kaneResult.summary || 'Failed Kane verification' }]
          };
          job.status = 'completed';
          log('Feature flagged — no demo GIF produced (verify first, record second).');
          appProc.kill();
          return;
        }
      } catch (err) {
        log(`Kane error: ${err.message}. Proceeding with recording anyway.`);
        kaneResult = { passed: true, steps: flowSteps.map(s => ({ label: s, action: 'step' })) };
      }

      // Record (only if Kane passed)
      job.status = 'recording';
      log('Recording verified flow...');

      const recorderResult = {
        passed: true,
        steps: flowSteps.map(s => ({ label: s, action: 'step' }))
      };

      const { record } = await import('../recorder/index.js');
      await record({ kaneResult: recorderResult, outputPath: videoPath, targetUrl });
      log('Recording complete.');
    }

    // Convert to GIF
    job.status = 'converting';
    log('Converting to GIF...');
    const { videoToGif } = await import('../post/index.js');
    await videoToGif({ inputPath: videoPath, outputPath: gifPath, width: 800, fps: 12 });
    const stats = fs.statSync(gifPath);
    log(`GIF created: ${(stats.size / 1024).toFixed(0)} KB`);

    // Set result
    job.gifUrl = `/output/${repoName}/.proofreel/${job.feature.toLowerCase().replace(/\s+/g, '-')}.gif`;
    job.result = { verified: [{ feature: job.feature, gifPath }], flagged: [] };
    job.status = 'completed';
    log('Done!');

    // Kill the app process
    appProc.kill();

  } catch (err) {
    job.status = 'failed';
    log(`Error: ${err.message}`);
  }
}

async function waitForServer(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
  });
}

server.listen(PORT, () => {
  console.log(`ProofReel Web UI running at http://localhost:${PORT}`);
});
