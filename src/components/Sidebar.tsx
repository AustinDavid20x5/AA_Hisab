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

export default function Sidebar() {
  const [expandedGroups, setExpandedGroups] = useState<string[]>(['Master Forms', 'Transactions', 'Reports', 'User Management']);

  const toggleGroup = (groupName: string) => {
    setExpandedGroups(prev => 
      prev.includes(groupName) 
        ? prev.filter(name => name !== groupName)
        : [...prev, groupName]
    );
  };

  return (
    <aside className="fixed top-0 left-0 z-40 w-64 h-screen pt-20 transition-transform -translate-x-full bg-white border-r border-gray-200 sm:translate-x-0 dark:bg-gray-800 dark:border-gray-700">
      <div className="h-full px-3 pb-4 overflow-y-auto bg-white dark:bg-gray-800">
        <ul className="space-y-2 font-medium">
          {navigation.map((item) => (
            <li key={item.name}>
              {!item.children ? (
                <NavLink
                  to={item.path}
                  end
                  className={({ isActive }) =>
                    `flex items-center p-2 text-gray-900 rounded-lg dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 group ${
                      isActive ? 'bg-gray-100 dark:bg-gray-700' : ''
                    }`
                  }
                >
                  <item.icon className="w-5 h-5" />
                  <span className="ml-3">{item.name}</span>
                </NavLink>
              ) : (
                <>
                  <div
                    className="flex items-center justify-between p-2 text-gray-900 rounded-lg dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                    onClick={() => toggleGroup(item.name)}
                  >
                    <div className="flex items-center">
                      <item.icon className="w-5 h-5" />
                      <span className="ml-3">{item.name}</span>
                    </div>
                    {expandedGroups.includes(item.name) ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </div>
                  {expandedGroups.includes(item.name) && (
                    <ul className="ml-6 space-y-2 mt-2">
                      {item.children.map((child) => (
                        <li key={child.path}>
                          <NavLink
                            to={child.path}
                            className={({ isActive }) =>
                              `flex items-center p-2 text-gray-900 rounded-lg dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 group ${
                                isActive ? 'bg-gray-100 dark:bg-gray-700' : ''
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