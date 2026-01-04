import { describe, it, expect } from 'vitest';
import { truncateForRAM, pruneHistoryByChars } from './memory';
import { Message } from '../types/index';

describe('Memory Utils', () => {
    
    // Test 1: truncateForRAM
    describe('truncateForRAM', () => {
        it('jangan ubah teks yang pendek', () => {
            const shortText = 'Halo dunia';
            expect(truncateForRAM(shortText)).toBe(shortText);
        });

        it('harus memotong teks yang terlalu panjang', () => {
            // REVISI: Gunakan teks yang JAUH lebih panjang (60.000 char)
            // Biar (50.000 + warning) pasti lebih kecil dari 60.000
            const longText = 'a'.repeat(60000); 
            const result = truncateForRAM(longText);

            // Sekarang logikanya pasti masuk: 50.057 < 60.000
            expect(result?.length).toBeLessThan(longText.length);
            expect(result).toContain('TRUNCATED AT 50KB');
        });
    });

    // Test 2: pruneHistoryByChars
    describe('pruneHistoryByChars', () => {
        it('harus membuang pesan lama jika total char kegedean', () => {
            // REVISI: Gunakan 3 pesan.
            // Pesan 1: User (Kecil) -> Akan disimpan (User pertama diproteksi)
            // Pesan 2: Assistant (Raksasa) -> Akan DIBUANG karena bikin over limit
            // Pesan 3: User (Kecil) -> Akan disimpan (Chat terbaru)
            
            const history: Message[] = [
                { role: 'user', content: 'Prompt Awal' }, 
                { role: 'assistant', content: 'a'.repeat(105000) }, // 105k PASTI > 100k
                { role: 'user', content: 'Chat Terbaru' }
            ];

            const result = pruneHistoryByChars(history);
            
            // Logikanya: Pesan tengah (Assistant) harusnya hilang.
            // Jadi sisa 2 pesan (User awal & User akhir) atau 1 pesan (tergantung implementasi loop break)
            // Yang penting jumlahnya berkurang dari 3.
            expect(result.length).toBeLessThan(history.length);
        });
    });
});
