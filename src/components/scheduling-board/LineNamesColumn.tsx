
import React from "react";
import { Button } from "../ui/button";
import { FileDown } from "lucide-react";
import { ProductionLine } from "../../types/scheduler";

interface LineNamesColumnProps {
  productionLines: ProductionLine[];
  handleDownloadLinePdf: (id: string, name: string) => void;
}

export const LineNamesColumn: React.FC<LineNamesColumnProps> = ({
  productionLines,
  handleDownloadLinePdf,
}) => (
  <div
    className="w-48 flex-shrink-0 bg-card border-r border-border"
    style={{ position: "sticky", left: 0, zIndex: 15, minWidth: 192, top: 0 }}
  >
    {productionLines.map((line) => (
      <div key={line.id} className="p-4 border-b border-border flex flex-col items-start min-h-[120px]">
        <div className="font-medium">{line.name}</div>
        <div className="text-sm text-muted-foreground">
          Capacity: {line.capacity}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="mt-2 flex items-center gap-1"
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

