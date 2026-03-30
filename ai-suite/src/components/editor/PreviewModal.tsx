import React, { useRef, useState, useEffect } from 'react';
import { X, Play, Pause, Film, Mic } from 'lucide-react';
import { Button } from '../ui/Button';
import { Scene } from '../../types';

interface PreviewModalProps {
    scene: Scene | null;
    onClose: () => void;
    onGenerateMotion: (id: string) => void;
    onGenerateAudio: (id: string) => void;
}

export const PreviewModal: React.FC<PreviewModalProps> = ({
    scene,
    onClose,
    onGenerateMotion,
    onGenerateAudio
}) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const previewVideoRef = useRef<HTMLVideoElement>(null);
    const previewAudioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        if (scene) {
            setIsPlaying(true);
        }
    }, [scene]);

    useEffect(() => {
        if (scene && isPlaying) {
            const video = previewVideoRef.current;
            const audio = previewAudioRef.current;
            
            if (video) {
                video.play().catch(() => setIsPlaying(false));
                if (audio) {
                    audio.currentTime = video.currentTime;
                    audio.play().catch(console.error);
                }
            } else if (audio) {
                audio.play().catch(() => setIsPlaying(false));
            }
        }
    }, [scene, isPlaying]);

    const togglePreviewPlay = () => {
        if (isPlaying) {
            previewVideoRef.current?.pause();
            previewAudioRef.current?.pause();
        } else {
            previewVideoRef.current?.play();
            previewAudioRef.current?.play();
        }
        setIsPlaying(!isPlaying);
    };

    if (!scene) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
            <button onClick={onClose} className="absolute top-6 right-8 text-zinc-400 hover:text-white bg-black/20 hover:bg-zinc-800/50 rounded-full p-2 transition-colors z-[110]">
                <X size={24} />
            </button>
            <div className="relative w-full max-w-6xl aspect-video bg-black rounded-xl overflow-hidden border border-zinc-800 shadow-2xl flex flex-col">
                <div className="flex-1 relative bg-black flex items-center justify-center">
                    {scene.assetType === 'video' ? (
                        <video 
                            ref={previewVideoRef}
                            src={scene.assetUrl} 
                            className="w-full h-full object-contain" 
                            onEnded={() => setIsPlaying(false)}
                            onPlay={() => {
                                if (previewAudioRef.current) {
                                    previewAudioRef.current.currentTime = previewVideoRef.current?.currentTime || 0;
                                    previewAudioRef.current.play().catch(console.error);
                                }
                                setIsPlaying(true);
                            }}
                            onPause={() => {
                                previewAudioRef.current?.pause();
                                setIsPlaying(false);
                            }}
                            onClick={togglePreviewPlay}
                        />
                    ) : (
                        <div className="w-full h-full overflow-hidden relative">
                            <img 
                                src={scene.keyframeUrl || scene.assetUrl} 
                                className={`w-full h-full object-cover transition-transform ease-linear ${isPlaying ? 'scale-110' : 'scale-100'}`} 
                                style={{ transitionDuration: isPlaying ? `${Math.max(scene.estimatedDuration, 5)}s` : '0.5s' }}
                                alt="" 
                            />
                        </div>
                    )}
                    
                    {scene.audioUrl && (
                        <audio 
                            ref={previewAudioRef} 
                            src={scene.audioUrl} 
                            onEnded={() => setIsPlaying(false)}
                        />
                    )}

                    {/* Play Overlay */}
                    {!isPlaying && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/10 transition-colors cursor-pointer" onClick={togglePreviewPlay}>
                            <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center hover:scale-110 transition-transform">
                                <Play size={40} fill="white" className="ml-2 text-white" />
                            </div>
                        </div>
                    )}
                </div>
                
                {/* Controls Bar */}
                <div className="h-16 bg-zinc-900 border-t border-white/5 flex items-center px-6 justify-between">
                    <div className="flex items-center gap-4">
                        <button onClick={togglePreviewPlay} className="text-white hover:text-primary transition-colors">
                            {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
                        </button>
                        <div className="flex flex-col">
                            <span className="text-sm font-bold text-white">Scene {scene.number}</span>
                            <span className="text-xs text-zinc-500 font-mono">{scene.estimatedDuration}s</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {!scene.assetUrl || scene.assetType !== 'video' ? (
                            <Button size="sm" variant="primary" icon={<Film size={14} />} onClick={() => { onGenerateMotion(scene.id); onClose(); }}>
                                Generate Motion
                            </Button>
                        ) : null}
                        {!scene.audioUrl && (
                            <Button size="sm" variant="secondary" icon={<Mic size={14} />} onClick={() => { onGenerateAudio(scene.id); onClose(); }}>
                                Generate Audio
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
