// Executes Java code against a list of inputs using judge/runner.sh.
// JUDGE_MODE=docker  -> one locked-down container per job (production).
// JUDGE_MODE=local   -> runs runner.sh directly on this machine (DEV ONLY: no isolation at all).
//
// The job is streamed in as a tar on stdin and results come back as a tar on stdout,
// so no host directories are shared with the container.
const { spawn, execFile } = require('child_process');
const crypto = require('crypto');
const os = require('os');
const tar = require('tar-stream');
const config = require('../config');

const MAX_STDOUT_BYTES = 64 * 1024 * 1024;

function packJob(srcFile, code, inputs) {
  return new Promise((resolve, reject) => {
    const pack = tar.pack();
    const chunks = [];
    pack.on('data', (c) => chunks.push(c));
    pack.on('end', () => resolve(Buffer.concat(chunks)));
    pack.on('error', reject);
    pack.entry({ name: srcFile }, code);
    inputs.forEach((inp, i) => {
      let text = String(inp ?? '');
      if (text && !text.endsWith('\n')) text += '\n';
      pack.entry({ name: `tests/${i + 1}.in` }, text);
    });
    pack.finalize();
  });
}

function unpack(buffer) {
  return new Promise((resolve, reject) => {
    const files = {};
    const extract = tar.extract();
    extract.on('entry', (header, stream, next) => {
      const parts = [];
      stream.on('data', (c) => parts.push(c));
      stream.on('end', () => {
        if (header.type === 'file') files[header.name.replace(/^\.\//, '')] = Buffer.concat(parts).toString('utf8');
        next();
      });
      stream.resume();
    });
    extract.on('finish', () => resolve(files));
    extract.on('error', reject);
    extract.end(buffer);
  });
}

/** Finds the public class name so `public class Solution` also works. */
function detectClass(code) {
  const m = /public\s+(?:final\s+|abstract\s+)*class\s+([A-Za-z_$][\w$]*)/.exec(code);
  return m ? m[1] : 'Main';
}

function dockerArgs(name, env, memoryMb) {
  const containerMem = Math.max(config.judge.containerMemoryMb, memoryMb + 384);
  const args = [
    'run', '--rm', '-i',
    '--name', name,
    '--network', 'none',
    '--cpus', '1',
    '--memory', `${containerMem}m`,
    '--memory-swap', `${containerMem}m`,
    '--pids-limit', '160',
    '--read-only',
    '--tmpfs', '/tmp:rw,nosuid,size=256m',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--ulimit', 'nofile=256:256',
    '--log-driver', 'none',
  ];
  for (const [k, v] of Object.entries(env)) args.push('-e', `${k}=${v}`);
  args.push(config.judge.image);
  return args;
}

/**
 * @returns {Promise<{ compileError: string|null, results: Array<{exitCode:number,timeMs:number,stdout:string,stderr:string}> }>}
 */
async function execute({ code, inputs, timeLimitMs, memoryMb }) {
  const className = detectClass(code);
  const srcFile = `${className}.java`;
  const tlSec = ((timeLimitMs + config.judge.jvmGraceMs) / 1000).toFixed(2);
  const env = {
    SRC_FILE: srcFile,
    MAIN_CLASS: className,
    N_TESTS: String(inputs.length),
    TL_SEC: tlSec,
    MEM_MB: String(memoryMb),
    COMPILE_TIMEOUT_SEC: String(config.judge.compileTimeoutSec),
    MAX_OUT_KB: String(config.judge.maxOutputKb),
  };
  const input = await packJob(srcFile, code, inputs);
  const name = `judge-${crypto.randomBytes(6).toString('hex')}`;
  const hardTimeoutMs = (config.judge.compileTimeoutSec + inputs.length * (Number(tlSec) + 1) + 20) * 1000;

  let child;
  if (config.judge.mode === 'local') {
    let bashCmd = 'bash';
    let scriptPath = config.judge.runnerScript;
    const envObj = { PATH: process.env.PATH, HOME: os.tmpdir(), TMPDIR: os.tmpdir(), LANG: 'C.UTF-8', ...env };
    if (process.platform === 'win32') {
      const fs = require('fs');
      const gitBash = 'C:\\Program Files\\Git\\bin\\bash.exe';
      if (fs.existsSync(gitBash)) {
        bashCmd = gitBash;
      }
      scriptPath = scriptPath.replace(/\\/g, '/');
      envObj.HOME = '/tmp';
      envObj.TMPDIR = '/tmp';
    }
    child = spawn(bashCmd, [scriptPath], {
      env: envObj,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } else {
    child = spawn('docker', dockerArgs(name, env, memoryMb), { stdio: ['pipe', 'pipe', 'pipe'] });
  }

  const out = [];
  let outBytes = 0;
  let errText = '';
  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (config.judge.mode !== 'local') execFile('docker', ['kill', name], () => {});
      child.kill('SIGKILL');
      reject(new Error('Judge hard timeout'));
    }, hardTimeoutMs);
    child.stdout.on('data', (c) => {
      outBytes += c.length;
      if (outBytes > MAX_STDOUT_BYTES) {
        child.kill('SIGKILL');
        return;
      }
      out.push(c);
    });
    child.stderr.on('data', (c) => {
      if (errText.length < 4000) errText += c.toString();
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (codeExit) => {
      clearTimeout(timer);
      if (codeExit !== 0) return reject(new Error(`Runner exited ${codeExit}: ${errText.slice(0, 500)}`));
      resolve();
    });
  });
  child.stdin.on('error', () => {});
  child.stdin.end(input);
  await done;

  const files = await unpack(Buffer.concat(out));
  const status = (files.status || '').trim();
  if (status === 'CE') return { compileError: files['compile.txt'] || 'Compilation failed', results: [] };
  if (status !== 'OK') throw new Error(`Runner returned no status. stderr: ${errText.slice(0, 300)}`);

  const results = (files['results.txt'] || '')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [i, exitCode, ms] = line.split(' ').map(Number);
      return {
        exitCode,
        timeMs: ms,
        stdout: files[`${i}.out`] ?? '',
        stderr: files[`${i}.err`] ?? '',
      };
    });
  return { compileError: null, results };
}

module.exports = { execute, detectClass };
