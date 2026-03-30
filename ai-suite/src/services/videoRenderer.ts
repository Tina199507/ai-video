
import { Scene } from "../types";
import JSZip from 'jszip';
import { wait } from "../lib/utils";
import { Logger } from "../lib/logger";
import { pcmToWav } from "../lib/audioUtils";

/**
 * Packaging Service & Client-Side Renderer
 */

// --- UTILS FOR RENDERING ---

const getSupportedMimeType = (): string => {
    const types = [
        'video/mp4',
        'video/mp4;codecs=h264',
        'video/mp4;codecs=avc1',
        'video/mp4;codecs=h264,aac',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm'
    ];
    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
};

const fetchBlob = async (url: string): Promise<Blob> => {
    try {
        const response = await fetch(url, { mode: 'cors' });
        if (!response.ok) throw new Error(`Failed to fetch ${url}`);
        return await response.blob();
    } catch (e) {
        Logger.warn(`CORS fetch failed for ${url}, trying direct load`, e);
        throw e;
    }
};

const loadImage = async (url: string): Promise<HTMLImageElement> => {
    // Try fetching as blob first to handle CORS better
    let src = url;
    try {
        const blob = await fetchBlob(url);
        src = URL.createObjectURL(blob);
    } catch (e) {
        // Fallback to direct URL if fetch fails (might still work if simple CORS)
    }

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = src;
        img.onload = () => resolve(img);
        img.onerror = reject;
    });
};

const loadVideo = async (url: string): Promise<HTMLVideoElement> => {
    let src = url;
    try {
        const blob = await fetchBlob(url);
        src = URL.createObjectURL(blob);
    } catch (e) {
        // Fallback
    }

    return new Promise((resolve, reject) => {
        const vid = document.createElement('video');
        vid.crossOrigin = "anonymous";
        vid.src = src;
        vid.muted = true; // We play audio via AudioContext
        vid.preload = 'auto';
        vid.onloadeddata = () => resolve(vid);
        vid.onerror = reject;
    });
};

const loadAudio = async (url: string, ctx: AudioContext): Promise<AudioBuffer | null> => {
    try {
        const response = await fetch(url, { mode: 'cors' });
        const arrayBuffer = await response.arrayBuffer();
        return await ctx.decodeAudioData(arrayBuffer);
    } catch (e) {
        // Retry logic for legacy "MP3" that is actually PCM (from previous Gemini Adapter bug)
        if (url.startsWith('data:audio/mp3;base64,')) {
             try {
                 Logger.info("Attempting to recover legacy PCM audio...");
                 const base64 = url.split(',')[1];
                 // Try 24kHz (Gemini default)
                 const wavBase64 = pcmToWav(base64, 24000); 
                 const wavUrl = `data:audio/wav;base64,${wavBase64}`;
                 
                 const response = await fetch(wavUrl);
                 const arrayBuffer = await response.arrayBuffer();
                 const buffer = await ctx.decodeAudioData(arrayBuffer);
                 Logger.info("Recovered legacy audio successfully.");
                 return buffer;
             } catch (retryErr) {
                 Logger.warn("Retry with PCM-to-WAV conversion failed", retryErr);
             }
        }

        Logger.error(`Failed to decode audio from ${url.substring(0, 50)}...`, e);
        return null; // Return null to indicate failure, caller should handle fallback
    }
};

const drawSubtitles = (ctx: CanvasRenderingContext2D, text: string, width: number, height: number, isPortrait: boolean) => {
    if (!text) return;

    const fontSize = isPortrait ? 48 : 40;
    ctx.font = `bold ${fontSize}px "Inter", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const paddingX = 40;
    const paddingY = 20;
    const maxWidth = width * 0.85;
    
    // Simple line wrapping
    const words = text.split(' ');
    let lines: string[] = [];
    let currentLine = "";

    for (let i = 0; i < words.length; i++) {
        const testLine = currentLine ? currentLine + " " + words[i] : words[i];
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = words[i];
        } else {
            currentLine = testLine;
        }
    }
    lines.push(currentLine);

    // Limit to 2 lines as per requirements
    if (lines.length > 2) lines = lines.slice(0, 2);

    const lineHeight = fontSize * 1.3;
    const totalTextHeight = lines.length * lineHeight;
    const boxHeight = totalTextHeight + (paddingY * 2);
    
    // Calculate max width of the lines for the box
    let maxLineWidth = 0;
    lines.forEach(line => {
        const w = ctx.measureText(line).width;
        if (w > maxLineWidth) maxLineWidth = w;
    });
    const boxWidth = maxLineWidth + (paddingX * 2);

    const bottomMargin = isPortrait ? 150 : 80;
    const boxY = height - bottomMargin - boxHeight;
    const boxX = (width - boxWidth) / 2;

    // 1. Draw Background Box (Semi-transparent black)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    // Rounded rect effect
    const radius = 12;
    ctx.beginPath();
    ctx.moveTo(boxX + radius, boxY);
    ctx.lineTo(boxX + boxWidth - radius, boxY);
    ctx.quadraticCurveTo(boxX + boxWidth, boxY, boxX + boxWidth, boxY + radius);
    ctx.lineTo(boxX + boxWidth, boxY + boxHeight - radius);
    ctx.quadraticCurveTo(boxX + boxWidth, boxY + boxHeight, boxX + boxWidth - radius, boxY + boxHeight);
    ctx.lineTo(boxX + radius, boxY + boxHeight);
    ctx.quadraticCurveTo(boxX, boxY + boxHeight, boxX, boxY + boxHeight - radius);
    ctx.lineTo(boxX, boxY + radius);
    ctx.quadraticCurveTo(boxX, boxY, boxX + radius, boxY);
    ctx.closePath();
    ctx.fill();

    // 2. Draw Text (White)
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 4;
    
    lines.forEach((line, i) => {
        const lineY = boxY + paddingY + (i * lineHeight) + (lineHeight / 2);
        ctx.fillText(line, width / 2, lineY);
    });
    
    // Reset shadow
    ctx.shadowBlur = 0;
};

const BGM_URL = "https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=ambient-classical-guitar-144998.mp3";

export const generateProjectKit = async (
    scenes: Scene[], 
    projectTitle: string,
    script: string,
    mood: string, 
    onProgress: (msg: string) => void
): Promise<Blob> => {
    onProgress("Initializing Project Kit...");
    const zip = new JSZip();
    const safeTitle = (projectTitle || 'Project_Alpha').replace(/[^a-z0-9]/gi, '_');
    
    // Create Folder Structure
    const root = zip.folder(safeTitle);
    const videoFolder = root?.folder("01_Visual_Assets");
    const audioFolder = root?.folder("02_Audio_Assets");
    const docsFolder = root?.folder("03_Documents");

    // 1. Save Documents
    onProgress("Packaging Scripts & Metadata...");
    docsFolder?.file("script.md", script);
    
    const metadata = {
        project: projectTitle,
        generatedAt: new Date().toISOString(),
        sceneCount: scenes.length,
        mood: mood,
        scenes: scenes.map((s, i) => ({
            number: i + 1,
            id: s.id,
            narrative: s.narrative,
            duration: s.estimatedDuration,
            visual: s.assetUrl ? `01_Visual_Assets/Scene_${(i+1).toString().padStart(3, '0')}_Visual.${s.assetType === 'video' ? 'mp4' : 'png'}` : null,
            audio: s.audioUrl ? `02_Audio_Assets/Scene_${(i+1).toString().padStart(3, '0')}_Voice.wav` : null
        })),
        notes: "Import assets into your NLE. Use Scene numbers to align video and audio."
    };
    
    docsFolder?.file("project_metadata.json", JSON.stringify(metadata, null, 2));

    // 2. Save Assets
    for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const padNum = (i + 1).toString().padStart(3, '0');
        onProgress(`Packaging Scene ${i + 1}/${scenes.length}...`);

        if (scene.assetUrl) {
            try {
                const blob = await fetchBlob(scene.assetUrl);
                const ext = scene.assetType === 'video' ? 'mp4' : 'png';
                videoFolder?.file(`Scene_${padNum}_Visual.${ext}`, blob);
            } catch (e) {
                Logger.warn(`Failed to package visual for scene ${i+1}`, e);
            }
        }

        if (scene.audioUrl) {
            try {
                const blob = await fetchBlob(scene.audioUrl);
                audioFolder?.file(`Scene_${padNum}_Voice.wav`, blob);
            } catch (e) {
                Logger.warn(`Failed to package audio for scene ${i+1}`, e);
            }
        }
    }

    onProgress("Compressing Archive...");
    return await zip.generateAsync({ type: "blob" });
}

// --- NEW TIMELINE RENDERER ---

interface RenderClip {
    id: string;
    type: 'video' | 'image' | 'audio' | 'subtitle';
    start: number;
    duration: number;
    media?: HTMLImageElement | HTMLVideoElement | AudioBuffer;
    text?: string;
    volume?: number;
    effect?: 'zoom-in' | 'pan-left' | 'none';
}

const buildTimeline = async (scenes: Scene[], audioCtx: AudioContext): Promise<{ clips: RenderClip[], totalDuration: number }> => {
    const clips: RenderClip[] = [];
    let currentTime = 0;

    for (const scene of scenes) {
        // 1. Load Audio to determine duration
        let audioBuffer: AudioBuffer | null = null;
        if (scene.audioUrl) {
            audioBuffer = await loadAudio(scene.audioUrl, audioCtx);
        }
        
        // Determine duration
        let duration = scene.estimatedDuration || 5;
        if (audioBuffer) duration = audioBuffer.duration;
        duration = Math.max(duration, 2); // Min 2s

        // 2. Visual Clip
        if (scene.assetUrl) {
            const media = scene.assetType === 'video' 
                ? await loadVideo(scene.assetUrl) 
                : await loadImage(scene.assetUrl);
            
            clips.push({
                id: `visual-${scene.id}`,
                type: scene.assetType === 'video' ? 'video' : 'image',
                start: currentTime,
                duration: duration,
                media: media,
                effect: scene.assetType === 'image' ? 'zoom-in' : 'none'
            });
        }

        // 3. Audio Clip
        if (audioBuffer) {
            clips.push({
                id: `audio-${scene.id}`,
                type: 'audio',
                start: currentTime,
                duration: duration,
                media: audioBuffer,
                volume: 1.0
            });
        }

        // 4. Subtitle Clip
        if (scene.narrative) {
            clips.push({
                id: `sub-${scene.id}`,
                type: 'subtitle',
                start: currentTime,
                duration: duration,
                text: scene.narrative
            });
        }

        currentTime += duration;
    }

    return { clips, totalDuration: currentTime };
};

export const compileEpisode = async (
    scenes: Scene[],
    aspectRatio: "16:9" | "9:16",
    onProgress: (msg: string) => void
): Promise<Blob> => {
    const mimeType = getSupportedMimeType();
    if (!mimeType) throw new Error("No supported video mime type found");

    onProgress(`Initializing Renderer (${mimeType})...`);
    
    // 1. Setup Canvas & Context
    const width = aspectRatio === "16:9" ? 1920 : 1080;
    const height = aspectRatio === "16:9" ? 1080 : 1920;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    
    // Fill background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    // 2. Setup Audio
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const dest = audioCtx.createMediaStreamDestination();
    
    // Load BGM
    onProgress("Loading Background Music...");
    const bgmBuffer = await loadAudio(BGM_URL, audioCtx);
    let bgmSource: AudioBufferSourceNode | null = null;
    if (bgmBuffer) {
        bgmSource = audioCtx.createBufferSource();
        bgmSource.buffer = bgmBuffer;
        bgmSource.loop = true;
        
        const bgmGain = audioCtx.createGain();
        bgmGain.gain.value = 0.15; // 15% volume
        
        bgmSource.connect(bgmGain);
        bgmGain.connect(dest);
        bgmSource.start(0);
    }

    // 3. Build Timeline
    onProgress("Building Timeline & Preloading Assets...");
    const { clips, totalDuration } = await buildTimeline(scenes, audioCtx);

    // 4. Setup Recorder
    const stream = canvas.captureStream(30); // 30 FPS
    dest.stream.getAudioTracks().forEach(track => stream.addTrack(track));
    
    const recorder = new MediaRecorder(stream, { 
        mimeType, 
        videoBitsPerSecond: 8000000 // 8 Mbps
    });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    
    recorder.start();

    // 5. Main Render Loop
    const fps = 30;
    const frameDuration = 1 / fps;
    const totalFrames = Math.ceil(totalDuration * fps);
    
    // Schedule Audio Playback
    clips.filter(c => c.type === 'audio').forEach(clip => {
        const source = audioCtx.createBufferSource();
        source.buffer = clip.media as AudioBuffer;
        source.connect(dest);
        source.start(audioCtx.currentTime + clip.start);
    });

    onProgress("Rendering Frames...");
    const renderStartTime = performance.now();

    for (let frame = 0; frame < totalFrames; frame++) {
        const time = frame * frameDuration;
        
        // Clear
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);

        // Find active visual clips
        const activeVisuals = clips.filter(c => 
            (c.type === 'image' || c.type === 'video') && 
            time >= c.start && time < (c.start + c.duration)
        );

        // Draw Visuals
        for (const clip of activeVisuals) {
            const localTime = time - clip.start;
            const progress = localTime / clip.duration;

            let visualElement = clip.media as HTMLImageElement | HTMLVideoElement;
            
            // Handle Video Playback Sync
            if (clip.type === 'video' && visualElement instanceof HTMLVideoElement) {
                // Ensure video is at correct time
                if (Math.abs(visualElement.currentTime - localTime) > 0.1) {
                    visualElement.currentTime = localTime;
                }
                // We don't need to play() because we are capturing frames, 
                // but for captureStream to work, the video element usually needs to be playing or seeked.
                // Setting currentTime is often enough for drawing to canvas.
            }

            // Calculate Draw Dimensions (Cover)
            let vW = 0, vH = 0;
            if (visualElement instanceof HTMLVideoElement) {
                vW = visualElement.videoWidth;
                vH = visualElement.videoHeight;
            } else {
                vW = visualElement.width;
                vH = visualElement.height;
            }

            const vRatio = vW / vH;
            const cRatio = width / height;
            let drawW, drawH, offsetX, offsetY;

            if (vRatio > cRatio) {
                drawH = height;
                drawW = height * vRatio;
                offsetX = (width - drawW) / 2;
                offsetY = 0;
            } else {
                drawW = width;
                drawH = width / vRatio;
                offsetX = 0;
                offsetY = (height - drawH) / 2;
            }

            // Apply Effects
            if (clip.effect === 'zoom-in') {
                const scale = 1.0 + (0.1 * progress);
                const scaledW = drawW * scale;
                const scaledH = drawH * scale;
                const scaledX = offsetX - (scaledW - drawW) / 2;
                const scaledY = offsetY - (scaledH - drawH) / 2;
                ctx.drawImage(visualElement, scaledX, scaledY, scaledW, scaledH);
            } else {
                ctx.drawImage(visualElement, offsetX, offsetY, drawW, drawH);
            }
        }

        // Draw Subtitles
        const activeSub = clips.find(c => 
            c.type === 'subtitle' && 
            time >= c.start && time < (c.start + c.duration)
        );
        if (activeSub && activeSub.text) {
             drawSubtitles(ctx, activeSub.text, width, height, aspectRatio === '9:16');
        }

        // Wait for next frame time to maintain real-time recording speed
        const targetNextFrameTime = renderStartTime + ((frame + 1) * frameDuration * 1000);
        const delay = targetNextFrameTime - performance.now();
        if (delay > 0) await wait(delay);
        
        if (frame % 30 === 0) {
            onProgress(`Rendering: ${Math.round((frame / totalFrames) * 100)}%`);
        }
    }

    // 6. Finish
    onProgress("Finalizing Video...");
    if (bgmSource) bgmSource.stop();
    recorder.stop();
    audioCtx.close();

    // Wait for recorder to flush chunks
    return new Promise((resolve) => {
        recorder.onstop = () => {
            const blob = new Blob(chunks, { type: mimeType });
            resolve(blob);
        };
    });
};
