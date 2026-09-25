import { execFile } from 'node:child_process';

export type MalwareScanResult =
    | { ok: true; mode: 'command' | 'disabled'; output?: string }
    | { ok: false; mode: 'command' | 'disabled'; reason: 'infected' | 'unavailable'; output?: string };

export async function runMalwareScan(fileBytes: Buffer, fileName: string): Promise<MalwareScanResult> {
    const cmd = process.env.PROFILE_PICTURE_SCAN_COMMAND?.trim();
    if (!cmd) {
        const production = process.env.NODE_ENV?.trim().toLowerCase() === 'production';
        if (production) {
            console.error('[file-scan] scanner is not configured');
            return { ok: false, mode: 'disabled', reason: 'unavailable', output: 'Malware scanner is not configured.' };
        }
        return { ok: true, mode: 'disabled' };
    }
    return new Promise<MalwareScanResult>((resolve) => {
        const child = execFile(cmd, [fileName], { timeout: 8000 }, (error, stdout, stderr) => {
            if (error) {
                const exitCode = typeof error.code === 'number' ? error.code : null;
                const output = `${stdout}\n${stderr}`.trim();
                // ClamAV-compatible scanners use exit code 1 for infected files.
                // Missing commands, timeouts, and other exit codes mean that
                // scanning could not be completed, not that the file is unsafe.
                if (exitCode === 1) {
                    return resolve({ ok: false, mode: 'command', reason: 'infected', output });
                }
                console.error('[file-scan] configured scanner unavailable', { exitCode });
                return resolve({ ok: false, mode: 'command', reason: 'unavailable', output });
            }
            resolve({ ok: true, mode: 'command', output: `${stdout}\n${stderr}`.trim() });
        });
        child.stdin?.write(fileBytes);
        child.stdin?.end();
    });
}
