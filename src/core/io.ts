import * as readline from 'node:readline/promises';

/** Read all of stdin to EOF (for piped `--*-stdin` secret input). */
export async function readStdinAll(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

/** Prompt on stderr and read one line from stdin. */
export async function promptLine(message: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await rl.question(message);
    return answer.trim();
  } finally {
    rl.close();
  }
}

export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY);
}
