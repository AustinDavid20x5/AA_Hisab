import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  CreditCard,
  PieChart,
  Users,
  Search,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Menu,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from './ui/sidebar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';

const navigation = [
  {
    name: 'Dashboard',
    path: '/',
    icon: BarChart3,
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
      { name: 'Bank Entry', path: '/transactions/bank-entry' },
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
      { name: 'Bank Book', path: '/reports/bank-book' },
      { name: 'Cash Book', path: '/reports/cash-book' },
      { name: 'Commission Report', path: '/reports/commission' },
      { name: 'Zakat Calculation', path: '/reports/zakat-calculation' },
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

function EnhancedSidebarContent() {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<string[]>([
    'Master Forms',
    'Transactions',
    'Reports',
    'User Management',
  ]);
  const [isAnimating, setIsAnimating] = useState(false);
  const { state, toggleSidebar } = useSidebar();

  const toggleGroup = (groupName: string) => {
    setIsAnimating(true);
    setExpandedGroups((prev) =>
      prev.includes(groupName)
        ? prev.filter((name) => name !== groupName)
        : [...prev, groupName]
    );
    setTimeout(() => setIsAnimating(false), 300);
  };

  // Filter navigation items based on search term
  const filteredNavigation = navigation.filter((item) => {
    if (item.name.toLowerCase().includes(searchTerm.toLowerCase())) {
      return true;
    }
    if (item.children) {
      return item.children.some((child) =>
        child.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    return false;
  });

  return (
    <>
      <SidebarHeader className="p-3 border-b relative bg-gradient-to-r from-sidebar-background to-sidebar-background/95 backdrop-blur-sm">
        {/* Toggle Button and Search Bar in Same Row */}
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggleSidebar}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background hover:bg-accent hover:text-accent-foreground transition-all duration-300 shadow-sm hover:shadow-md z-30 flex-shrink-0 -ml-1 sidebar-item-hover group animate-bounce-in"
                >
                  {state === 'expanded' ? (
                    <ChevronLeft className="h-3 w-3 icon-bounce group-hover:scale-110 transition-transform duration-300" />
                  ) : (
                    <Menu className="h-3 w-3 icon-bounce group-hover:scale-110 transition-transform duration-300" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>{state === 'expanded' ? 'Collapse sidebar' : 'Expand sidebar'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {state === 'expanded' && (
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2 h-3 w-3 text-muted-foreground z-10 transition-all duration-300 hover:text-primary hover:scale-110" />
              <SidebarInput
                placeholder="Search menu..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-7 text-sm transition-all duration-300 hover:shadow-md focus:shadow-lg focus:ring-2 focus:ring-primary/20 bg-gradient-to-r from-background to-background/95"
              />
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent className="bg-gradient-to-b from-sidebar-background via-sidebar-background to-sidebar-background/98">
        <SidebarGroup>
          {state === 'expanded' && (
            <SidebarGroupLabel className="text-sidebar-foreground/80 font-semibold tracking-wide">
              Navigation
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredNavigation.map((item, index) => (
                <SidebarMenuItem key={item.name}>
                  {!item.children ? (
                    <SidebarMenuButton asChild tooltip={item.name} className="sidebar-item-hover group">
                      <NavLink
                        to={item.path}
                        className={({ isActive }) =>
                          `transition-all duration-300 rounded-lg ${isActive 
                            ? 'bg-gradient-to-r from-sidebar-accent to-sidebar-accent/80 text-sidebar-accent-foreground shadow-md border border-sidebar-border/50' 
                            : 'hover:bg-gradient-to-r hover:from-sidebar-accent/50 hover:to-sidebar-accent/30'
                          }`
                        }
                      >
                        <item.icon className="size-3 group-data-[collapsible=icon]:size-4 icon-bounce group-hover:text-primary transition-all duration-300" />
                        {state === 'expanded' && (
                          <span className="font-medium transition-all duration-300 group-hover:translate-x-1">
                            {item.name}
                          </span>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  ) : (
                    <>
                      <SidebarMenuButton
                        onClick={() => {
                          if (state === 'collapsed') {
                            // Expand sidebar when collapsed and icon is clicked
                            toggleSidebar();
                          } else {
                            toggleGroup(item.name);
                          }
                        }}
                        tooltip={item.name}
                        className="w-full justify-between sidebar-item-hover group transition-all duration-300 hover:bg-gradient-to-r hover:from-sidebar-accent/50 hover:to-sidebar-accent/30 rounded-lg"
                      >
                        <div className="flex items-center gap-2">
                          <item.icon className="size-3 group-data-[collapsible=icon]:size-4 icon-bounce group-hover:text-primary transition-all duration-300" />
                          {state === 'expanded' && (
                            <span className="font-medium transition-all duration-300 group-hover:translate-x-1">
                              {item.name}
                            </span>
                          )}
                        </div>
                        {state === 'expanded' && (
                          <ChevronDown
                            className={`size-3 transition-all duration-500 icon-bounce ${
                              expandedGroups.includes(item.name) ? 'rotate-180 text-primary' : 'group-hover:rotate-12'
                            }`}
                          />
                        )}
                      </SidebarMenuButton>
                      {state === 'expanded' && expandedGroups.includes(item.name) && (
                        <SidebarMenuSub className={`${isAnimating ? 'animate-pulse' : ''}`}>
                          {item.children
                            .filter((child) =>
                              searchTerm === '' ||
                              child.name.toLowerCase().includes(searchTerm.toLowerCase())
                            )
                            .map((child, childIndex) => (
                              <SidebarMenuSubItem key={child.path}>
                                <SidebarMenuSubButton asChild className="sidebar-item-hover group">
                                  <NavLink
                                    to={child.path}
                                    className={({ isActive }) =>
                                      `transition-all duration-300 rounded-md ml-2 pl-6 relative ${isActive
                                        ? 'bg-gradient-to-r from-sidebar-accent to-sidebar-accent/80 text-sidebar-accent-foreground shadow-sm border-l-2 border-primary'
                                        : 'hover:bg-gradient-to-r hover:from-sidebar-accent/40 hover:to-sidebar-accent/20 hover:border-l-2 hover:border-primary/50'
                                      }`
                                    }
                                  >
                                    <span className="text-sm font-medium transition-all duration-300 group-hover:translate-x-1 group-hover:text-primary">
                                      {child.name}
                                    </span>
                                  </NavLink>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                        </SidebarMenuSub>
                      )}
                    </>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </>
  );
}

interface EnhancedSidebarProps {
  children: React.ReactNode;
}

export function EnhancedSidebarProvider({ children }: EnhancedSidebarProps) {
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="border-r">
        <EnhancedSidebarContent />
      </Sidebar>
      {children}
    </SidebarProvider>
  );
}

export { SidebarTrigger };