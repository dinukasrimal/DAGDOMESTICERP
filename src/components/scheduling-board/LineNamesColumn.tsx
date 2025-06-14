
import React from "react";
import { Button } from "../ui/button";
import { FileDown } from "lucide-react";
import { ProductionLine } from "../../types/scheduler";

interface LineNamesColumnProps {
  lines: ProductionLine[];
  handleDownloadLinePdf: (id: string, name: string) => void;
}

export const LineNamesColumn: React.FC<LineNamesColumnProps> = ({
  lines,
  handleDownloadLinePdf,
}) => (
  <div>
    {lines.map((line) => (
      <div
        key={line.id}
        className="p-4 border-b border-border min-h-[120px] flex flex-col items-start justify-center"
      >
        <div className="font-bold text-lg">{line.name}</div>
        <div className="text-sm text-muted-foreground mb-2">
          Capacity: {line.capacity}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="flex items-center gap-1"
          onClick={() => handleDownloadLinePdf(line.id, line.name)}
          title="Download Production Plan PDF"
        >
          <FileDown className="w-4 h-4 mr-1" />
          <span>Plan PDF</span>
        </Button>
      </div>
    ))}
  </div>
);
