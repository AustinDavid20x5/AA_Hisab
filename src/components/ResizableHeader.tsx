import React from 'react';

interface ResizableHeaderProps {
  children: React.ReactNode;
  onResizeStart: (e: React.MouseEvent) => void;
  width: number;
  className?: string;
}

export function ResizableHeader({ children, onResizeStart, width, className = '' }: ResizableHeaderProps) {
  return (
    <th 
      className={`relative ${className}`}
      style={{ width: `${width}px` }}
    >
      <div className="flex items-center justify-between">
        {children}
        <div
          className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-500 group"
          onMouseDown={onResizeStart}
        >
          <div className="absolute right-0 top-0 h-full w-1 opacity-0 group-hover:opacity-100 bg-blue-500" />
        </div>
      </div>
    </th>
  );
}