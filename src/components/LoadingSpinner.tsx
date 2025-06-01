import React from 'react';
import { Skeleton } from './ui/skeleton';

interface LoadingSpinnerProps {
  title?: string;
  height?: string;
  className?: string;
}

export function LoadingSpinner({ 
  title = 'Loading...', 
  height = 'h-64',
  className = ''
}: LoadingSpinnerProps) {
  return (
    <div className={`p-4 text-center ${className}`}>
      <div className="space-y-4">
        {title && (
          <div className="flex justify-center items-center gap-2">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
            <h3 className="text-lg font-medium text-foreground">{title}</h3>
          </div>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className={`${height} w-full rounded-lg`} />
          <div className="space-y-4">
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-3/4 rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-2/3 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}