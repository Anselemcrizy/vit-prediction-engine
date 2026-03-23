import React, { useState, useRef, useCallback } from 'react';
import { UploadCloud, Link as LinkIcon, Image as ImageIcon, Loader2, Zap } from 'lucide-react';
import { useCreatePrediction } from '@workspace/api-client-react';
import { getListPredictionsQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface ImageUploaderProps {
  onSuccess?: (id: number) => void;
}

export function ImageUploader({ onSuccess }: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [mode, setMode] = useState<'upload' | 'url'>('upload');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const queryClient = useQueryClient();
  
  const { mutate, isPending, error } = useCreatePrediction({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListPredictionsQueryKey() });
        setUrlInput('');
        if (onSuccess) onSuccess(data.id);
      }
    }
  });

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      mutate({
        data: {
          sport: "football",
          homeTeam: "UploadHome",
          awayTeam: "UploadAway",
          league: "Uploaded",
          matchDate: new Date().toISOString(),
        }
      });
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  }, [mutate]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    mutate({
      data: {
        sport: "football",
        homeTeam: "URLHome",
        awayTeam: "URLAway",
        league: "URLLeague",
        matchDate: new Date().toISOString(),
      }
    });
  };

  // Sample images for quick testing
  const sampleImages = [
    { url: "https://images.unsplash.com/photo-1543852786-1cf6624b9987?w=500&q=80", label: "Cat" },
    { url: "https://images.unsplash.com/photo-1517849845537-4d257902454a?w=500&q=80", label: "Dog" },
    { url: "https://images.unsplash.com/photo-1494548162494-384bba4ab999?w=500&q=80", label: "Space" }
  ];

  const handleSampleClick = (url: string) => {
    mutate({
      data: {
        sport: "football",
        homeTeam: "SampleHome",
        awayTeam: "SampleAway",
        league: "SampleLeague",
        matchDate: new Date().toISOString(),
      },
    });
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="glass-panel rounded-2xl overflow-hidden relative">
        
        {/* Animated processing overlay */}
        <AnimatePresence>
          {isPending && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center border-2 border-primary/50 rounded-2xl"
            >
              <div className="relative">
                <div className="absolute inset-0 border-t-2 border-primary rounded-full animate-spin" />
                <div className="absolute inset-2 border-r-2 border-secondary rounded-full animate-spin [animation-direction:reverse]" />
                <Zap className="w-8 h-8 text-primary animate-pulse relative z-10 m-6" />
              </div>
              <h3 className="mt-4 font-display text-xl glow-text text-primary">Running VIT Model</h3>
              <p className="text-sm text-muted-foreground font-mono mt-1">Analyzing tensors...</p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex border-b border-border/50">
          <button
            onClick={() => setMode('upload')}
            className={cn(
              "flex-1 py-4 text-sm font-semibold transition-all duration-300 flex items-center justify-center gap-2",
              mode === 'upload' ? "text-primary border-b-2 border-primary bg-primary/5" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            )}
          >
            <UploadCloud className="w-4 h-4" />
            Upload File
          </button>
          <button
            onClick={() => setMode('url')}
            className={cn(
              "flex-1 py-4 text-sm font-semibold transition-all duration-300 flex items-center justify-center gap-2",
              mode === 'url' ? "text-primary border-b-2 border-primary bg-primary/5" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            )}
          >
            <LinkIcon className="w-4 h-4" />
            Image URL
          </button>
        </div>

        <div className="p-8">
          {mode === 'upload' ? (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 group",
                isDragging 
                  ? "border-primary bg-primary/10 scale-[1.02] shadow-[0_0_30px_rgba(0,255,255,0.1)]" 
                  : "border-muted-foreground/30 hover:border-primary/50 hover:bg-white/5"
              )}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileSelect} 
                accept="image/*" 
                className="hidden" 
              />
              <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4 group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-500">
                <ImageIcon className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <h3 className="text-xl font-display font-semibold mb-2">Drag & Drop Image</h3>
              <p className="text-sm text-muted-foreground text-center">
                or click to browse from your computer.<br/>
                Supports JPG, PNG, WEBP.
              </p>
            </div>
          ) : (
            <form onSubmit={handleUrlSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Remote Image URL</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://example.com/image.jpg"
                    className="flex-1 bg-background/50 border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono text-sm"
                    required
                  />
                  <button
                    type="submit"
                    disabled={isPending || !urlInput}
                    className="bg-primary text-primary-foreground px-6 py-3 rounded-lg font-semibold hover:bg-primary/90 hover:shadow-[0_0_15px_rgba(0,255,255,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    Analyze
                  </button>
                </div>
              </div>
              
              <div className="pt-6">
                <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wider font-semibold">Try a sample</p>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {sampleImages.map((sample, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSampleClick(sample.url)}
                      className="relative w-24 h-24 rounded-lg overflow-hidden border border-border hover:border-primary transition-all group shrink-0"
                    >
                      <img src={sample.url} alt={sample.label} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[10px] font-bold text-white uppercase">{sample.label}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </form>
          )}

          {error && (
            <div className="mt-4 p-4 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-destructive/20 flex items-center justify-center shrink-0 mt-0.5">!</div>
              <div>
                <p className="font-semibold">Prediction Failed</p>
                <p className="opacity-80">{(error as any)?.message || "An unknown error occurred"}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
