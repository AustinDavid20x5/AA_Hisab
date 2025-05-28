import React, { useState, useEffect } from 'react';
import { Plus, Search, X, Shield } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';

interface PagePermission {
  allowed: boolean;
}

interface Permissions {
  // Master Forms
  currency: PagePermission;
  chart_of_accounts: PagePermission;
  categories: PagePermission;
  subcategories: PagePermission;
  transaction_types: PagePermission;
  
  // Transactions
  cash_entry: PagePermission;
  interparty_transfer: PagePermission;
  journal_voucher: PagePermission;
  manager_cheque: PagePermission;
  bank_transfer: PagePermission;
  general_trading: PagePermission;
  
  // Reports
  general_ledger: PagePermission;
  trial_balance: PagePermission;
  commission_report: PagePermission;
  cash_book: PagePermission;
}

interface Role {
  id: string;
  name: string;
  permissions: Permissions;
  created_at: string;
  updated_at: string;
}

interface EditModalProps {
  role: Role | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (roleData: Partial<Role>) => Promise<void>;
}

const AVAILABLE_PERMISSIONS = {
  masterForms: {
    title: 'Master Forms',
    pages: {
      currency: 'Currency Management',
      chart_of_accounts: 'Chart of Accounts',
      categories: 'Categories',
      subcategories: 'Sub Categories',
      transaction_types: 'Transaction Types'
    }
  },
  transactions: {
    title: 'Transactions',
    pages: {
      cash_entry: 'Cash Entry',
      interparty_transfer: 'Interparty Transfer',
      journal_voucher: 'Journal Voucher',
      manager_cheque: 'Manager Cheque',
      bank_transfer: 'Bank Transfer',
      general_trading: 'General Trading'
    }
  },
  reports: {
    title: 'Reports',
    pages: {
      general_ledger: 'General Ledger',
      trial_balance: 'Trial Balance',
      commission_report: 'Commission Report',
      cash_book: 'Cash Book'
    }
  }
};

function EditModal({ role, isOpen, onClose, onSave }: EditModalProps) {
  const [formData, setFormData] = useState<Partial<Role>>({
    name: '',
    permissions: {}
  });

  useEffect(() => {
    if (role) {
      setFormData({
        name: role.name,
        permissions: role.permissions
      });
    } else {
      // Initialize with all permissions set to false
      const initialPermissions: Permissions = {} as Permissions;
      Object.values(AVAILABLE_PERMISSIONS).forEach(section => {
        Object.keys(section.pages).forEach(page => {
          initialPermissions[page as keyof Permissions] = { allowed: false };
        });
      });
      setFormData({
        name: '',
        permissions: initialPermissions
      });
    }
  }, [role]);

  const handlePermissionChange = (page: string, allowed: boolean) => {
    setFormData(prev => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [page]: { allowed }
      }
    }));
  };

  const handleSelectAllForSection = (section: keyof typeof AVAILABLE_PERMISSIONS, allowed: boolean) => {
    const updatedPermissions = { ...formData.permissions };
    Object.keys(AVAILABLE_PERMISSIONS[section].pages).forEach(page => {
      updatedPermissions[page as keyof Permissions] = { allowed };
    });
    setFormData(prev => ({
      ...prev,
      permissions: updatedPermissions
    }));
  };

  const isAllSelectedForSection = (section: keyof typeof AVAILABLE_PERMISSIONS): boolean => {
    return Object.keys(AVAILABLE_PERMISSIONS[section].pages).every(page => 
      formData.permissions?.[page as keyof Permissions]?.allowed === true
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(formData);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">
            {role ? 'Edit Role' : 'Add Role'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Role Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          <div>
            <h3 className="text-lg font-medium mb-4">Page Permissions</h3>
            
            {Object.entries(AVAILABLE_PERMISSIONS).map(([sectionKey, section]) => (
              <div key={sectionKey} className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-md font-medium text-gray-700 dark:text-gray-300">
                    {section.title}
                  </h4>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={isAllSelectedForSection(sectionKey as keyof typeof AVAILABLE_PERMISSIONS)}
                      onChange={(e) => handleSelectAllForSection(sectionKey as keyof typeof AVAILABLE_PERMISSIONS, e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Select All</span>
                  </label>
                </div>

                <div className="space-y-2">
                  {Object.entries(section.pages).map(([pageKey, pageLabel]) => (
                    <div key={pageKey} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-700 dark:text-gray-300">{pageLabel}</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.permissions?.[pageKey as keyof Permissions]?.allowed || false}
                            onChange={(e) => handlePermissionChange(pageKey, e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                          <span className="ml-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                            {formData.permissions?.[pageKey as keyof Permissions]?.allowed ? 'Allowed' : 'Not Allowed'}
                          </span>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 dark:text-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function RolesManagement() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRoles();
  }, []);

  const fetchRoles = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('roles')
        .select('*')
        .order('name');

      if (error) {
        if (error.message.includes('not allowed')) {
          setError('You do not have permission to view roles');
        } else {
          setError('Failed to fetch roles');
        }
        return;
      }

      setRoles(data || []);
    } catch (error) {
      console.error('Error fetching roles:', error);
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (role: Role) => {
    setEditingRole(role);
    setIsEditModalOpen(true);
  };

  const handleAddNew = () => {
    setEditingRole(null);
    setIsEditModalOpen(true);
  };

  const handleSave = async (roleData: Partial<Role>) => {
    try {
      if (editingRole) {
        const { error } = await supabase
          .from('roles')
          .update({
            name: roleData.name,
            permissions: roleData.permissions,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingRole.id);

        if (error) throw error;
        toast.success('Role updated successfully');
      } else {
        const { error } = await supabase
          .from('roles')
          .insert({
            name: roleData.name,
            permissions: roleData.permissions
          });

        if (error) throw error;
        toast.success('Role created successfully');
      }

      fetchRoles();
    } catch (error) {
      console.error('Error saving role:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save role');
    }
  };

  const getEnabledPermissionsCount = (permissions: Permissions): number => {
    return Object.values(permissions).filter(p => p.allowed).length;
  };

  const filteredRoles = roles.filter(role =>
    role.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (error) {
    return (
      <div className="p-4 text-center">
        <div className="bg-red-50 dark:bg-red-900/50 p-4 rounded-lg">
          <p className="text-red-600 dark:text-red-300">{error}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 text-center">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mx-auto mb-4"></div>
          <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Roles Management</h1>
        <button
          onClick={handleAddNew}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Role
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="p-6">
          <div className="flex gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search roles..."
                className="w-full pl-10 pr-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left border-b dark:border-gray-700">
                  <th className="pb-3 font-semibold">Role Name</th>
                  <th className="pb-3 font-semibold">Enabled Pages</th>
                  <th className="pb-3 font-semibold">Created At</th>
                  <th className="pb-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-700">
                {filteredRoles.map((role) => (
                  <tr key={role.id}>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        {role.name}
                      </div>
                    </td>
                    <td className="py-3">
                      <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded dark:bg-blue-900 dark:text-blue-300">
                        {getEnabledPermissionsCount(role.permissions)} pages enabled
                      </span>
                    </td>
                    <td className="py-3">
                      {new Date(role.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => handleEdit(role)}
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 font-medium"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Showing {filteredRoles.length} of {roles.length} roles
            </div>
          </div>
        </div>
      </div>

      <EditModal
        role={editingRole}
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSave={handleSave}
      />
    </div>
  );
}