import { useState, useCallback } from 'react';

interface ColumnWidth {
  [key: string]: number;
}

export function useResizableColumns(initialWidths: ColumnWidth) {
  const [columnWidths, setColumnWidths] = useState<ColumnWidth>(initialWidths);
  const [isResizing, setIsResizing] = useState(false);
  const [currentColumn, setCurrentColumn] = useState<string | null>(null);
  const [startX, setStartX] = useState(0);
  const [startWidth, setStartWidth] = useState(0);

  const handleResizeStart = useCallback((e: React.MouseEvent, columnId: string) => {
    e.preventDefault();
    setIsResizing(true);
    setCurrentColumn(columnId);
    setStartX(e.pageX);
    setStartWidth(columnWidths[columnId]);
  }, [columnWidths]);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!isResizing || !currentColumn) return;

    const diff = e.pageX - startX;
    const newWidth = Math.max(50, startWidth + diff); // Minimum width of 50px

    setColumnWidths(prev => ({
      ...prev,
      [currentColumn]: newWidth
    }));
  }, [isResizing, currentColumn, startX, startWidth]);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
    setCurrentColumn(null);
  }, []);

  return {
    columnWidths,
    handleResizeStart,
    handleResizeMove,
    handleResizeEnd,
    isResizing
  };
}