import { ArrowRight, Image as ImageIcon, Scissors } from "lucide-react";

export interface PairVisualizationProps {
  startImageUrl: string;
  endImageUrl: string | null;
  isPaired: boolean;
}

export function PairVisualization({ startImageUrl, endImageUrl, isPaired }: PairVisualizationProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative aspect-video w-32 overflow-hidden border border-border bg-muted">
        {startImageUrl ? (
          <img src={startImageUrl} alt="start frame" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground"><ImageIcon className="h-4 w-4" /></div>
        )}
        <span className="absolute bottom-1 left-1 bg-black/60 px-1.5 py-0.5 text-[8px] uppercase tracking-wider text-white">start</span>
      </div>
      <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" />
      <div className="relative aspect-video w-32 overflow-hidden border border-border bg-muted">
        {endImageUrl ? (
          <img src={endImageUrl} alt="end frame" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground"><ImageIcon className="h-4 w-4" /></div>
        )}
        <span className="absolute bottom-1 left-1 inline-flex items-center gap-0.5 bg-black/60 px-1.5 py-0.5 text-[8px] uppercase tracking-wider text-white">
          {isPaired ? "end (paired)" : (<><Scissors className="h-3 w-3" />end (crop)</>)}
        </span>
      </div>
    </div>
  );
}
