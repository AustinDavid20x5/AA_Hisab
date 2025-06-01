import React, { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { LogOut, DollarSign } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { ModeToggle } from './mode-toggle';
import { EnhancedSidebarProvider } from './EnhancedSidebar';
import { SidebarInset, useSidebar } from './ui/sidebar';
import { supabase } from '../lib/supabase';

function LayoutContent() {
  const { isResizing } = useSidebar();

  return (
    <SidebarInset className={`flex-1 flex-col ${!isResizing ? 'transition-all duration-200 ease-linear' : ''}`}>
      <div className="flex flex-1 flex-col gap-4 p-4 overflow-y-auto overflow-x-hidden bg-background">
        <Outlet />
      </div>
    </SidebarInset>
  );
}

export default function Layout() {
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is authenticated
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/auth');
      }
    };

    checkAuth();
  }, [navigate]);

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      toast.success('Logged out successfully');
      navigate('/auth');
    } catch (error) {
      console.error('Error logging out:', error);
      toast.error('Failed to log out');
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Fixed Top Header */}
      <header className="fixed top-0 left-0 right-0 flex h-16 shrink-0 items-center gap-4 border-b px-6 bg-background z-50">
        {/* App Name and Icon - Always visible */}
        <div className="flex items-center gap-3 group cursor-pointer transition-all duration-500 hover:scale-105">
          <div className="relative flex aspect-square size-10 items-center justify-center rounded-xl bg-gradient-to-br from-green-400 via-emerald-500 to-green-600 text-white shadow-2xl hover:shadow-green-500/30 transition-all duration-500 hover:rotate-12 hover:scale-110 border border-green-400/20 backdrop-blur-sm">
            {/* 3D Inner Shadow */}
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/20 to-transparent opacity-50"></div>
            {/* Animated Background Glow */}
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-green-300/40 to-emerald-600/40 animate-pulse opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <DollarSign className="size-6 font-bold relative z-10 transition-all duration-500 group-hover:scale-125 group-hover:rotate-12 drop-shadow-lg" />
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight transition-all duration-300 group-hover:translate-x-1">
            <span className="truncate font-bold text-lg bg-gradient-to-r from-foreground via-primary to-foreground bg-clip-text text-transparent group-hover:from-green-600 group-hover:via-emerald-500 group-hover:to-green-600 transition-all duration-500 drop-shadow-sm">FinTrack Pro</span>
            <span className="truncate text-xs text-muted-foreground group-hover:text-green-600 transition-colors duration-300 font-medium">Financial Management</span>
          </div>
          {/* Floating Particles Effect */}
          <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full opacity-0 group-hover:opacity-100 group-hover:animate-ping transition-all duration-500"></div>
          <div className="absolute -bottom-1 -left-1 w-1.5 h-1.5 bg-emerald-400 rounded-full opacity-0 group-hover:opacity-100 group-hover:animate-ping transition-all duration-700 delay-200"></div>
        </div>
        
        <div className="ml-auto flex items-center space-x-4">
          <ModeToggle />
          <button
            onClick={handleLogout}
            className="
              relative overflow-hidden group
              flex items-center space-x-2 px-4 py-2 rounded-lg
              border-2 border-red-200/50 dark:border-red-800/50
              bg-gradient-to-br from-background via-background/80 to-red-50/30 dark:to-red-950/30
              text-red-600 dark:text-red-400
              hover:border-red-300/70 dark:hover:border-red-600/70
              hover:bg-gradient-to-br hover:from-red-50/50 hover:to-red-100/50
              dark:hover:from-red-950/50 dark:hover:to-red-900/50
              hover:text-red-700 dark:hover:text-red-300
              hover:shadow-lg hover:shadow-red-500/20
              transition-all duration-500 ease-out
              hover:scale-105 active:scale-95
              shadow-md hover:shadow-xl
              backdrop-blur-sm
              before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/10 before:to-transparent before:opacity-0 before:group-hover:opacity-100 before:transition-opacity before:duration-300
              after:absolute after:inset-0 after:bg-gradient-to-r after:from-transparent after:via-red-200/20 after:to-transparent after:-skew-x-12 after:translate-x-[-100%] after:group-hover:translate-x-[200%] after:transition-transform after:duration-700 after:ease-out
            "
          >
            {/* Animated Background Glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-red-400/10 via-red-500/10 to-red-600/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-lg" />
            
            <LogOut className="
              h-4 w-4 relative z-10
              transition-all duration-500 ease-out
              group-hover:rotate-12 group-hover:scale-105
              drop-shadow-sm group-hover:drop-shadow-md
            " />
            <span className="
              relative z-10 font-medium
              transition-all duration-300
              group-hover:translate-x-0.5
              drop-shadow-sm
            ">Logout</span>
            
            {/* Floating Particles */}
            <div className="absolute top-1 right-1 w-1 h-1 bg-red-400 rounded-full opacity-0 group-hover:opacity-100 group-hover:animate-ping transition-all duration-500" />
            <div className="absolute bottom-1 left-1 w-0.5 h-0.5 bg-red-500 rounded-full opacity-0 group-hover:opacity-100 group-hover:animate-ping transition-all duration-700 delay-200" />
          </button>
        </div>
      </header>
      
      {/* Sidebar and Main Content Area */}
      <div className="flex flex-1 overflow-hidden pt-16">
        <EnhancedSidebarProvider>
          <LayoutContent />
        </EnhancedSidebarProvider>
      </div>
    </div>
  );
}