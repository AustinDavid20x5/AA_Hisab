import React from 'react';

interface DateFilterProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
}

export default function DateFilter({ startDate, endDate, onStartDateChange, onEndDateChange }: DateFilterProps) {
  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <input
          type="date"
          value={startDate}
          onChange={(e) => onStartDateChange(e.target.value)}
          className="px-4 py-2 border border-border rounded-lg bg-background hover:bg-accent transition-colors shadow-sm focus:ring-2 focus:ring-sidebar-ring focus:border-sidebar-ring text-gray-900 dark:!text-white [color-scheme:light] dark:[color-scheme:dark]"
        />
      </div>
      <span className="text-gray-900 dark:!text-white">to</span>
      <div className="relative">
        <input
          type="date"
          value={endDate}
          onChange={(e) => onEndDateChange(e.target.value)}
          className="px-4 py-2 border border-border rounded-lg bg-background hover:bg-accent transition-colors shadow-sm focus:ring-2 focus:ring-sidebar-ring focus:border-sidebar-ring text-gray-900 dark:!text-white [color-scheme:light] dark:[color-scheme:dark]"
        />
      </div>
    </div>
  );
}