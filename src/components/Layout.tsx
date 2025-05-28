import React, { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Sun, Moon, LogOut } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useThemeStore } from '../lib/store';
import Sidebar from './Sidebar';
import { supabase } from '../lib/supabase';

export default function Layout() {
  const { isDarkMode, toggleTheme } = useThemeStore();
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
    <>
      <nav className="fixed top-0 z-50 w-full bg-white border-b border-gray-200 dark:bg-gray-800 dark:border-gray-700">
        <div className="px-3 py-3 lg:px-5 lg:pl-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center justify-start">
              <span className="self-center text-xl font-semibold sm:text-2xl whitespace-nowrap dark:text-white">
                FinTrack Pro
              </span>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={toggleTheme}
                className="text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg p-2.5"
              >
                {isDarkMode ? <Sun /> : <Moon />}
              </button>
              <button
                onClick={handleLogout}
                className="text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg p-2.5"
              >
                <LogOut />
              </button>
            </div>
          </div>
        </div>
      </nav>

      <Sidebar />

      <div className="p-4 sm:ml-64 pt-20">
        <Outlet />
      </div>
    </>
  );
}