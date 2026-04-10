import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, AlertTriangle, Check, RotateCcw, SkipForward } from "lucide-react";
import {
  allProperties, needsReviewProperty, failedQcScenes,
  statusStages, getStatusColor, getRelativeTime
} from "@/lib/mock-data";

const Pipeline = () => {
  const getPropertiesByStatus = (status: string) =>
    allProperties.filter(p => p.status === status);

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* Kanban */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {statusStages.map(stage => {
          const props = getPropertiesByStatus(stage.key);
          return (
            <div key={stage.key} className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{stage.label}</span>
                <Badge variant="secondary" className="text-[10px] h-5">{props.length}</Badge>
              </div>
              <div className="space-y-2 min-h-[200px]">
                {props.length === 0 && (
                  <div className="border border-dashed border-border rounded-lg p-4 text-center">
                    <p className="text-xs text-muted-foreground">No items</p>
                  </div>
                )}
                {props.map(prop => (
                  <Card key={prop.id} className="hover:border-primary/30 transition-colors cursor-pointer">
                    <CardContent className="p-3 space-y-2">
                      <p className="text-xs font-medium truncate">{prop.address}</p>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                        <Clock className="h-3 w-3" />
                        {getRelativeTime(prop.created_at)}
                      </div>
                      {stage.key === "generating" && (
                        <div className="text-[10px] font-mono text-info">
                          {prop.selected_photo_count > 0
                            ? `${Math.floor(prop.selected_photo_count * 0.4)}/${prop.selected_photo_count} clips`
                            : "Starting..."}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Needs Review */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <h3 className="text-sm font-medium">Needs Review</h3>
            <Badge className="bg-warning text-warning-foreground text-[10px] h-5">
              {failedQcScenes.length}
            </Badge>
          </div>
          <div className="space-y-3">
            {failedQcScenes.map(scene => (
              <div key={scene.id} className="border border-border rounded-lg p-4 flex flex-col md:flex-row gap-4">
                <div className="w-full md:w-40 aspect-video bg-muted rounded flex items-center justify-center text-xs text-muted-foreground shrink-0">
                  Clip Preview
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Scene {scene.scene_number}</span>
                    <Badge className={getStatusColor(scene.status)} variant="secondary">{scene.status.replace(/_/g, " ")}</Badge>
                    <span className="font-mono text-xs text-muted-foreground">
                      Confidence: {(scene.qc_confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{scene.prompt}</p>
                  {scene.qc_issues?.issues && (
                    <ul className="space-y-1">
                      {scene.qc_issues.issues.map((issue: string, i: number) => (
                        <li key={i} className="text-xs text-destructive flex items-start gap-1">
                          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                          {issue}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                      <Check className="h-3 w-3" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                      <RotateCcw className="h-3 w-3" /> Retry
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-muted-foreground">
                      <SkipForward className="h-3 w-3" /> Skip
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Pipeline;
