import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFile, writeFile, listDirectory } from './tools.js';
import fs from 'fs';
import path from 'path';

// --- MOCKING SETUP ---
// Kita 'bajak' modul fs dan path supaya tidak merusak file asli saat testing
vi.mock('fs');
vi.mock('path');

describe('VoidEx Tools Testing', () => {

    // Reset kondisi sebelum setiap test case dijalankan
    beforeEach(() => {
        vi.resetAllMocks();

        // Setup default behaviour untuk path agar tidak error
        // @ts-ignore
        vi.mocked(path.resolve).mockImplementation((...args) => args.join('/'));
        // @ts-ignore
        vi.mocked(path.dirname).mockReturnValue('/mock/dir');
    });

    // --- TEST CASE 1: Membaca File (readFile) ---
    describe('readFile', () => {
        it('harus mengembalikan isi file jika file ditemukan', async () => {
            // Skenario: Kita pura-pura file 'target.txt' isinya "Hello World"
            vi.mocked(fs.readFileSync).mockReturnValue('Hello World');

            const result = await readFile({ path: 'target.txt' });

            // Ekspektasi: Tidak error, dan outputnya sesuai
            expect(result.isError).toBe(false);
            expect(result.output).toBe('Hello World');
        });

        it('harus error jika file tidak ada', async () => {
            // Skenario: Kita pura-pura file tidak ditemukan (throw Error)
            vi.mocked(fs.readFileSync).mockImplementation(() => {
                throw new Error('ENOENT: no such file or directory');
            });

            const result = await readFile({ path: 'ghost_file.txt' });

            // Ekspektasi: Error true, dan pesan error muncul
            expect(result.isError).toBe(true);
            expect(result.output).toContain('Error reading file');
        });
    });

    // --- TEST CASE 2: Menulis File (writeFile) ---
    describe('writeFile', () => {
        it('harus sukses menulis file', async () => {
            // Skenario: Folder tujuan dianggap sudah ada
            vi.mocked(fs.existsSync).mockReturnValue(true);

            const result = await writeFile({ path: 'logs.txt', content: 'Test Log' });

            expect(result.isError).toBe(false);
            expect(result.output).toContain('Successfully wrote');

            // Cek apakah fungsi fs.writeFileSync benar-benar dipanggil 1 kali
            expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
            // Cek apakah argumennya benar (nama file & isinya)
            expect(fs.writeFileSync).toHaveBeenCalledWith(
                expect.stringContaining('logs.txt'),
                'Test Log',
                'utf8'
            );
        });
    });

    // --- TEST CASE 3: List Directory (listDirectory) ---
    describe('listDirectory', () => {
        it('harus menampilkan daftar file dan folder', async () => {
            // Skenario: Struktur folder palsu
            const mockFiles = [
                { name: 'index.html', isDirectory: () => false },
                { name: 'assets', isDirectory: () => true }
            ];

            // @ts-ignore - kita mock objek dirent yang kompleks
            vi.mocked(fs.readdirSync).mockReturnValue(mockFiles as any);

            const result = await listDirectory({ path: '.' });

            expect(result.isError).toBe(false);
            // Folder harus ada slash '/' di belakangnya sesuai logika tools.ts kamu
            expect(result.output).toContain('index.html');
            expect(result.output).toContain('assets/');
        });
    });

});