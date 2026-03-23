import React from 'react';
import { useListPredictions, useDeletePrediction, getListPredictionsQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Trash2, Image as ImageIcon, History } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HistorySidebarProps {
  activeId: number | null;
  onSelect: (id: number) => void;
}

export function HistorySidebar({ activeId, onSelect }: HistorySidebarProps) {
  const { data: predictions = [], isLoading } = useListPredictions();
  const queryClient = useQueryClient();
  
  const deleteMutation = useDeletePrediction({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPredictionsQueryKey() });
      }
    }
  });

  const handleDelete = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (confirm('Delete this prediction record?')) {
      deleteMutation.mutate({ id });
    }
  };

  return (
    <aside className="w-full lg:w-80 border-r border-border/50 bg-card/30 backdrop-blur-xl h-full flex flex-col">
      <div className="p-6 border-b border-border/50">
        <h2 className="text-lg font-display font-bold flex items-center gap-2">
          <History className="w-5 h-5 text-primary" />
          Analysis History
        </h2>
        <p className="text-xs text-muted-foreground mt-1 font-mono">
          {predictions.length} records found
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-white/5 animate-pulse" />
          ))
        ) : predictions.length === 0 ? (
          <div className="text-center py-10 px-4 text-muted-foreground flex flex-col items-center">
            <ImageIcon className="w-8 h-8 mb-3 opacity-20" />
            <p className="text-sm">No predictions yet.</p>
            <p className="text-xs opacity-60 mt-1">Upload an image to start.</p>
          </div>
        ) : (
          predictions.map((p) => {
            const isActive = activeId === p.id;
            return (
              <button
                key={p.id}
                onClick={() => onSelect(p.id)}
                className={cn(
                  "w-full text-left p-3 rounded-xl flex gap-3 transition-all duration-200 group relative overflow-hidden",
                  isActive 
                    ? "bg-primary/10 border border-primary/30 shadow-[0_0_15px_rgba(0,255,255,0.05)]" 
                    : "hover:bg-white/5 border border-transparent hover:border-white/10"
                )}
              >
                {isActive && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                )}
                
                <div className="w-14 h-14 rounded-lg overflow-hidden bg-black/50 shrink-0 border border-white/10 relative flex items-center justify-center text-xs text-muted-foreground">
                  {p.sport?.toUpperCase() || "N/A"}
                </div>
                
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <h4 className="font-semibold text-sm truncate capitalize text-foreground group-hover:text-primary transition-colors">
                    {p.homeTeam} vs {p.awayTeam}
                  </h4>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={cn(
                      "text-xs font-mono px-1.5 py-0.5 rounded",
                      p.bestBetConfidence > 0.8 ? "bg-success/10 text-success" : "bg-secondary/10 text-secondary"
                    )}>
                      {(p.bestBetConfidence * 100).toFixed(0)}%
                    </span>
                    <span className="text-[10px] text-muted-foreground truncate">
                      {format(new Date(p.createdAt), 'MMM d')}
                    </span>
                  </div>
                </div>

                <button
                  onClick={(e) => handleDelete(e, p.id)}
                  disabled={deleteMutation.isPending}
                  className="opacity-0 group-hover:opacity-100 p-2 text-muted-foreground hover:text-destructive transition-all shrink-0 self-center absolute right-2 bg-card/80 backdrop-blur rounded-md"
                  title="Delete record"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
