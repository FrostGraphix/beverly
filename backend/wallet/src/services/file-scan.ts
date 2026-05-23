import { execFile } from 'node:child_process';

type MalwareScanResult =
    | { ok: boolean; mode: 'command'; output?: string }
    | { ok: boolean; mode: 'disabled'; output?: string };

export async function runMalwareScan(fileBytes: Buffer, fileName: string): Promise<MalwareScanResult> {
    const cmd = process.env.PROFILE_PICTURE_SCAN_COMMAND?.trim();
    if (!cmd) return { ok: true, mode: 'disabled', output: undefined };
    return new Promise<{ ok: boolean; mode: 'command'; output?: string }>((resolve) => {
        const child = execFile(cmd, [fileName], { timeout: 8000 }, (error, stdout, stderr) => {
            if (error) return resolve({ ok: false, mode: 'command', output: `${stdout}\n${stderr}`.trim() });
            resolve({ ok: true, mode: 'command', output: `${stdout}\n${stderr}`.trim() });
        });
        child.stdin?.write(fileBytes);
        child.stdin?.end();
    });
}
