import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  BookOpen,
  CreditCard,
  PieChart,
  Users,
  ChevronDown,
  ChevronRight,
  Menu,
  X,
} from 'lucide-react';

const navigation = [
  {
    name: 'Dashboard',
    path: '/',
    icon: LayoutDashboard,
  },
  {
    name: 'Master Forms',
    icon: BookOpen,
    children: [
      { name: 'Currency Management', path: '/master/currency' },
      { name: 'Chart of Accounts', path: '/master/coa' },
      { name: 'Categories', path: '/master/categories' },
      { name: 'Sub Categories', path: '/master/subcategories' },
      { name: 'Transaction Types', path: '/master/transaction-types' },
    ],
  },
  {
    name: 'Transactions',
    icon: CreditCard,
    children: [
      { name: 'Cash Entry', path: '/transactions/cash' },
      { name: 'Interparty Transfer', path: '/transactions/ipt' },
      { name: 'Bank Transfer and Manager Cheque', path: '/transactions/bank' },
      { name: 'Journal Voucher', path: '/transactions/jv' },
      { name: 'General Trading', path: '/transactions/trading' },
    ],
  },
  {
    name: 'Reports',
    icon: PieChart,
    children: [
      { name: 'General Ledger', path: '/reports/gl' },
      { name: 'Trial Balance', path: '/reports/trial-balance' },
      { name: 'Cash Book', path: '/reports/cash-book' },
      { name: 'Commission Report', path: '/reports/commission' },
    ],
  },
  {
    name: 'User Management',
    icon: Users,
    children: [
      { name: 'User Profiles', path: '/users/profiles' },
      { name: 'Roles Management', path: '/users/roles' },
    ],
  },
];

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  const [expandedGroups, setExpandedGroups] = useState<string[]>(['Master Forms', 'Transactions', 'Reports', 'User Management']);

  const toggleGroup = (groupName: string) => {
    setExpandedGroups(prev => 
      prev.includes(groupName) 
        ? prev.filter(name => name !== groupName)
        : [...prev, groupName]
    );
  };

  return (
    <aside className={`sidebar fixed top-0 left-0 z-40 h-screen pt-20 transition-all duration-300 bg-sidebar-background border-r border-sidebar-border ${
      isCollapsed ? 'w-16' : 'w-64'
    } ${isCollapsed ? '-translate-x-full sm:translate-x-0' : 'translate-x-0'}`}>
      {/* Toggle Button - Always visible on desktop */}
      <button
        onClick={onToggle}
        className="hidden sm:block fixed top-24 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full p-1.5 shadow-md hover:shadow-lg transition-all duration-300"
        style={{
          left: isCollapsed ? '52px' : '244px'
        }}
      >
        {isCollapsed ? <Menu className="w-4 h-4" /> : <X className="w-4 h-4" />}
      </button>
      
      <div className="h-full px-3 pb-4 overflow-y-auto bg-sidebar-background custom-scrollbar">
        <ul className="space-y-2 font-medium">
          {navigation.map((item) => (
            <li key={item.name}>
              {!item.children ? (
                <NavLink
                  to={item.path}
                  end
                  className={({ isActive }) =>
                    `flex items-center p-2 text-sidebar-foreground rounded-lg hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group transition-colors ${
                      isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : ''
                    }`
                  }
                  title={isCollapsed ? item.name : ''}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0 text-sidebar-foreground group-hover:text-sidebar-accent-foreground" />
                  {!isCollapsed && <span className="ml-3">{item.name}</span>}
                </NavLink>
              ) : (
                <>
                  <div
                    className="flex items-center justify-between p-2 text-sidebar-foreground rounded-lg hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer transition-colors"
                    onClick={() => toggleGroup(item.name)}
                    title={isCollapsed ? item.name : ''}
                  >
                    <div className="flex items-center">
                      <item.icon className="w-5 h-5 flex-shrink-0 text-sidebar-foreground" />
                      {!isCollapsed && <span className="ml-3">{item.name}</span>}
                    </div>
                    {!isCollapsed && (
                      expandedGroups.includes(item.name) ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )
                    )}
                  </div>
                  {!isCollapsed && expandedGroups.includes(item.name) && (
                    <ul className="ml-6 space-y-2 mt-2">
                      {item.children.map((child) => (
                        <li key={child.path}>
                          <NavLink
                            to={child.path}
                            className={({ isActive }) =>
                              `flex items-center p-2 text-sidebar-foreground rounded-lg hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group transition-colors ${
                                isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : ''
                              }`
                            }
                          >
                            <span className="ml-3">{child.name}</span>
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}