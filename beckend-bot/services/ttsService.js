const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const googleTTS = require('google-tts-api');
const axios = require('axios');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

class TtsService {
    constructor() {
        this.tempDir = path.join(__dirname, '../temp/tts');
        fs.ensureDirSync(this.tempDir);
        
        // Start automatic cleanup every hour
        this.startAutoCleanup();
    }

    startAutoCleanup() {
        // Run every hour
        setInterval(() => this.cleanupOldFiles(), 60 * 60 * 1000);
        // Also run once on startup
        setTimeout(() => this.cleanupOldFiles(), 5000);
    }

    async cleanupOldFiles() {
        try {
            const files = await fs.readdir(this.tempDir);
            const now = Date.now();
            const maxAge = 24 * 60 * 60 * 1000; // 24 hours

            for (const file of files) {
                const filePath = path.join(this.tempDir, file);
                const stats = await fs.stat(filePath);
                
                if (now - stats.mtimeMs > maxAge) {
                    await fs.remove(filePath);
                    console.log(`Auto-cleaned old TTS file: ${file}`);
                }
            }
        } catch (error) {
            console.error('Auto cleanup error:', error);
        }
    }

    async generateAudio(text, lang = 'en', voice = null) {
        const fileName = `${uuidv4()}.mp3`;
        const filePath = path.join(this.tempDir, fileName);

        try {
            const cleanText = text.replace(/[^\w\s.,!?'-]/g, '').trim();
            if (!cleanText) {
                throw new Error('No valid text for TTS generation');
            }

            if (voice && typeof voice === 'string' && voice.startsWith('en-')) {
                try {
                    const tts = new MsEdgeTTS();
                    await tts.setVoice(voice);
                    const buffer = await tts.toBuffer(cleanText, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
                    await fs.writeFile(filePath, buffer);
                    return filePath;
                } catch (edgeErr) {
                    console.warn('Edge TTS failed, falling back to Google:', edgeErr.message);
                }
            }

            await this.generateGoogleAudio(cleanText, filePath, 'en');
            return filePath;
        } catch (error) {
            console.error('Google TTS generation error:', error.message);
            throw new Error(`TTS synthesis failed: ${error.message}`);
        }
    }

    async generateGoogleAudio(text, filePath, lang = 'en') {
        try {
            // Clean text for TTS
            const cleanText = text.replace(/[^\w\s.,!?'-]/g, '').trim();
            
            if (!cleanText) {
                throw new Error('No valid text for TTS generation');
            }

            if (cleanText.length <= 200) {
                const url = googleTTS.getAudioUrl(cleanText, {
                    lang: lang,
                    slow: false,
                    host: 'https://translate.google.com',
                });
                
                const response = await axios.get(url, { 
                    responseType: 'arraybuffer',
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });
                
                if (!response.data || response.data.length === 0) {
                    throw new Error('Empty audio response from Google TTS');
                }
                
                await fs.writeFile(filePath, Buffer.from(response.data));
            } else {
                const results = googleTTS.getAllAudioUrls(cleanText, {
                    lang: lang,
                    slow: false,
                    host: 'https://translate.google.com',
                });
                
                const buffers = [];
                for (const result of results) {
                    const response = await axios.get(result.url, { 
                        responseType: 'arraybuffer',
                        timeout: 10000,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        }
                    });
                    
                    if (!response.data || response.data.length === 0) {
                        throw new Error('Empty audio response from Google TTS');
                    }
                    
                    buffers.push(Buffer.from(response.data));
                }
                
                if (buffers.length === 0) {
                    throw new Error('No audio data generated');
                }
                
                await fs.writeFile(filePath, Buffer.concat(buffers));
            }
        } catch (error) {
            throw new Error(`Google TTS synthesis failed: ${error.message}`);
        }
    }

    async generateFallbackAudio(text, filePath, lang = 'en') {
        try {
            // Use a different host or approach as fallback
            const cleanText = text.replace(/[^\w\s.,!?'-]/g, '').trim();
            
            if (!cleanText) {
                throw new Error('No valid text for fallback TTS');
            }

            const url = googleTTS.getAudioUrl(cleanText, {
                lang: lang,
                slow: false,
                host: 'https://translate.google.com', // Try direct Google
            });
            
            const response = await axios.get(url, { 
                responseType: 'arraybuffer',
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': '*/*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Referer': 'https://translate.google.com/'
                }
            });
            
            if (!response.data || response.data.length === 0) {
                throw new Error('Fallback TTS failed: Empty response');
            }
            
            await fs.writeFile(filePath, Buffer.from(response.data));
        } catch (error) {
            throw new Error(`Fallback TTS failed: ${error.message}`);
        }
    }

    async cleanup(filePath) {
        try {
            if (filePath && await fs.pathExists(filePath)) {
                await fs.remove(filePath);
            }
        } catch (error) {
            console.error('TTS Cleanup Error:', error);
        }
    }
}

module.exports = new TtsService();
