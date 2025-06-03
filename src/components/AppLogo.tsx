import React from 'react';

interface AppLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: 'size-6',
  md: 'size-8', 
  lg: 'size-10',
  xl: 'size-12'
};

const iconSizeClasses = {
  sm: 'size-3',
  md: 'size-4',
  lg: 'size-6', 
  xl: 'size-8'
};

const textSizeClasses = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl'
};

export function AppLogo({ size = 'md', showText = false, className = '' }: AppLogoProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className={`relative flex aspect-square ${sizeClasses[size]} items-center justify-center rounded-xl bg-gradient-to-br from-green-400 via-emerald-500 to-green-600 text-white shadow-2xl border border-green-400/20 backdrop-blur-sm`}>
        {/* 3D Inner Shadow */}
        <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/20 to-transparent opacity-50"></div>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`${iconSizeClasses[size]} font-bold relative z-10 transition-all duration-500 group-hover:scale-125 group-hover:rotate-12 drop-shadow-lg`}>
          <line x1="12" x2="12" y1="2" y2="22"></line>
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
        </svg>
      </div>
      {showText && (
        <div className="grid flex-1 text-left text-sm leading-tight">
          <span className={`truncate font-bold ${textSizeClasses[size]} bg-gradient-to-r from-foreground via-primary to-foreground bg-clip-text text-transparent drop-shadow-sm`}>
            FinTrack Pro
          </span>
          <span className="truncate text-xs text-muted-foreground font-medium">
            Financial Management
          </span>
        </div>
      )}
    </div>
  );
}

export default AppLogo;