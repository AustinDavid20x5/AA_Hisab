import React, { useState, useEffect, useRef } from 'react';
import { Plus, Search, X, FileSpreadsheet, Download } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import * as XLSX from 'xlsx';
import { LoadingSpinner } from '../../components/LoadingSpinner';

interface Account {
  id: string;
  code: string;
  name: string;
  alias_name?: string;
  subcategory_id: string;
  subcategory: SubCategory;
  is_active: boolean;
  zakat_eligible: boolean;
  is_cashbook: boolean;
  currency_id?: string;
  currency?: Currency;
}

interface Currency {
  id: string;
  code: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
}

interface SubCategory {
  id: string;
  name: string;
  category: Category;
}

interface EditModalProps {
  account: Account | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (accountData: Partial<Account>) => Promise<void>;
  subCategories: SubCategory[];
  currencies: Currency[];
}

function EditModal({ account, isOpen, onClose, onSave, subCategories, currencies }: EditModalProps) {
  const [formData, setFormData] = useState<Partial<Account>>({
    name: '',
    alias_name: '',
    subcategory_id: '',
    zakat_eligible: false,
    is_cashbook: false,
    currency_id: undefined,
    is_active: true
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (account) {
      setFormData({
        name: account.name,
        alias_name: account.alias_name,
        subcategory_id: account.subcategory_id,
        zakat_eligible: account.zakat_eligible,
        is_cashbook: account.is_cashbook,
        currency_id: account.currency_id,
        is_active: account.is_active
      });
    } else {
      setFormData({
        name: '',
        alias_name: '',
        subcategory_id: subCategories[0]?.id || '',
        zakat_eligible: false,
        is_cashbook: false,
        currency_id: undefined,
        is_active: true
      });
    }
    setError(null);
  }, [account, subCategories]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error('Error saving account:', error);
      if (error instanceof Error) {
        if (error.message.includes('policy')) {
          setError('You do not have permission to create or modify accounts');
        } else {
          setError(error.message);
        }
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">
            {account ? 'Edit Account' : 'Add Account'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg dark:bg-red-900/50 dark:border-red-800 dark:text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Account Title *
            </label>
            <input
              type="text"
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
              maxLength={100}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Alias Name
            </label>
            <input
              type="text"
              value={formData.alias_name || ''}
              onChange={(e) => setFormData({ ...formData, alias_name: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              maxLength={100}
              placeholder="Optional alternate name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Sub Category *
            </label>
            <select
              value={formData.subcategory_id || ''}
              onChange={(e) => setFormData({ ...formData, subcategory_id: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            >
              <option value="">Select Sub Category</option>
              {subCategories.map((subCategory) => (
                <option key={subCategory.id} value={subCategory.id}>
                  {subCategory.name} ({subCategory.category.name})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="zakat_eligible"
                checked={formData.zakat_eligible || false}
                onChange={(e) => setFormData({ ...formData, zakat_eligible: e.target.checked })}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
              />
              <label htmlFor="zakat_eligible" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                Zakat Eligible
              </label>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="is_cashbook"
                checked={formData.is_cashbook || false}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  is_cashbook: e.target.checked,
                  currency_id: e.target.checked ? formData.currency_id || currencies[0]?.id : undefined
                })}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
              />
              <label htmlFor="is_cashbook" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                Cash Book
              </label>
            </div>
          </div>

          {formData.is_cashbook && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Currency *
              </label>
              <select
                value={formData.currency_id || ''}
                onChange={(e) => setFormData({ ...formData, currency_id: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              >
                <option value="">Select Currency</option>
                {currencies.map((currency) => (
                  <option key={currency.id} value={currency.id}>
                    {currency.code} - {currency.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
            />
            <label htmlFor="is_active" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
              Active
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 dark:text-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ChartOfAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [subCategories, setSubCategories] = useState<SubCategory[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchSubCategories();
    fetchCurrencies();
    fetchAccounts();
  }, []);

  const fetchSubCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('subcategories')
        .select(`
          id,
          name,
          category:categories (
            id,
            name
          )
        `)
        .order('name');

      if (error) throw error;
      setSubCategories(data || []);
    } catch (error) {
      console.error('Error fetching subcategories:', error);
      toast.error('Failed to fetch subcategories');
    }
  };

  const fetchCurrencies = async () => {
    try {
      const { data, error } = await supabase
        .from('currencies')
        .select('id, code, name')
        .order('code');

      if (error) throw error;
      setCurrencies(data || []);
    } catch (error) {
      console.error('Error fetching currencies:', error);
      toast.error('Failed to fetch currencies');
    }
  };

  const fetchAccounts = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select(`
          *,
          subcategory:subcategories (
            id,
            name,
            category:categories (
              id,
              name
            )
          ),
          currency:currencies (
            id,
            code,
            name
          )
        `)
        .order('code');

      if (error) {
        if (error.message.includes('policy')) {
          throw new Error('You do not have permission to view accounts');
        }
        throw error;
      }
      
      setAccounts(data || []);
    } catch (error) {
      console.error('Error fetching accounts:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch accounts');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (account: Account) => {
    setEditingAccount(account);
    setIsEditModalOpen(true);
  };

  const handleSave = async (accountData: Partial<Account>) => {
    try {
      if (editingAccount) {
        // Update existing account
        const { error } = await supabase
          .from('chart_of_accounts')
          .update({
            name: accountData.name,
            alias_name: accountData.alias_name,
            subcategory_id: accountData.subcategory_id,
            zakat_eligible: accountData.zakat_eligible,
            is_cashbook: accountData.is_cashbook,
            currency_id: accountData.is_cashbook ? accountData.currency_id : null,
            is_active: accountData.is_active,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingAccount.id);

        if (error) {
          if (error.message.includes('policy')) {
            throw new Error('You do not have permission to update accounts');
          }
          throw error;
        }
        
        toast.success('Account updated successfully');
      } else {
        // Add new account
        const { error } = await supabase
          .from('chart_of_accounts')
          .insert({
            name: accountData.name,
            alias_name: accountData.alias_name,
            subcategory_id: accountData.subcategory_id,
            zakat_eligible: accountData.zakat_eligible,
            is_cashbook: accountData.is_cashbook,
            currency_id: accountData.is_cashbook ? accountData.currency_id : null,
            is_active: accountData.is_active
          });

        if (error) {
          if (error.message.includes('policy')) {
            throw new Error('You do not have permission to create accounts');
          }
          throw error;
        }

        toast.success('Account added successfully');
      }

      fetchAccounts();
    } catch (error) {
      console.error('Error saving account:', error);
      throw error;
    }
  };

  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const binaryStr = evt.target?.result;
        const workbook = XLSX.read(binaryStr, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);

        if (data.length === 0) {
          toast.error('No data found in the Excel file');
          return;
        }

        processImportedData(data);
        
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } catch (error) {
        console.error('Error parsing Excel file:', error);
        toast.error('Failed to parse Excel file');
      }
    };
    reader.readAsBinaryString(file);
  };

  const processImportedData = async (data: any[]) => {
    try {
      // Get business partner subcategory
      const { data: subcategories, error: subcatError } = await supabase
        .from('subcategories')
        .select('id')
        .eq('name', 'Business Partner')
        .limit(1);

      if (subcatError) {
        console.error('Error fetching subcategory:', subcatError);
        toast.error('Failed to fetch business partners');
        return;
      }

      // Handle case where no subcategory is found
      if (!subcategories?.length) {
        toast.error('Business Partner subcategory not found');
        return;
      }

      const subcategoryId = subcategories[0].id;

      const importedAccounts = data.map(row => {
        // Find subcategory by name
        const subcategory = subCategories.find(sc => 
          sc.name.toLowerCase() === String(row['Sub Category']).toLowerCase()
        );

        if (!subcategory) {
          throw new Error(`Sub Category "${row['Sub Category']}" not found`);
        }

        return {
          name: row['Account Title'],
          alias_name: row['Alias Name'] || null,
          subcategory_id: subcategory.id,
          zakat_eligible: row['Zakat Eligible']?.toString().toLowerCase() === 'yes' || false,
          is_active: true,
          is_cashbook: false
        };
      });

      // Validate required fields
      const missingFields = importedAccounts.reduce((errors: string[], account, index) => {
        if (!account.name) {
          errors.push(`Row ${index + 1}: Account Title is required`);
        }
        if (!account.subcategory_id) {
          errors.push(`Row ${index + 1}: Sub Category is required`);
        }
        return errors;
      }, []);

      if (missingFields.length > 0) {
        throw new Error(`Validation errors:\n${missingFields.join('\n')}`);
      }

      // Insert accounts
      for (const account of importedAccounts) {
        await handleSave(account);
      }

      toast.success(`Successfully imported ${importedAccounts.length} accounts`);
      fetchAccounts();
    } catch (error) {
      console.error('Error processing imported data:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to process imported data');
    }
  };

  const downloadTemplate = () => {
    try {
      const workbook = XLSX.utils.book_new();
      
      const headers = [
        'Code',
        'Name',
        'Alias Name',
        'Category',
        'Sub Category',
        'Zakat',
        'Cash Book',
        'Currency'
      ];
      
      const sampleData = accounts.map(account => ({
        'Code': account.code,
        'Name': account.name,
        'Alias Name': account.alias_name,
        'Category': account.subcategory.category.name,
        'Sub Category': account.subcategory.name,
        'Zakat': account.zakat_eligible ? 'Yes' : 'No',
        'Cash Book': account.is_cashbook ? 'Yes' : 'No',
        'Currency': account.currency ? account.currency.code : ''
      }));
      
      const worksheet = XLSX.utils.json_to_sheet(sampleData, { header: headers });
      
      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Chart of Accounts Template');
      
      // Generate Excel file
      XLSX.writeFile(workbook, 'chart_of_accounts_template.xlsx');
      
      toast.success('Template downloaded successfully');
    } catch (error) {
      console.error('Error downloading template:', error);
      toast.error('Failed to download template');
    }
  };

  const filteredAccounts = accounts.filter(account =>
    account.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    account.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    account.alias_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    account.subcategory?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    account.subcategory?.category.name.toLowerCase().includes(searchTerm.toLowerCase())
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
    return <LoadingSpinner title="Loading Chart of Accounts..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Chart of Accounts</h1>
        <div className="flex gap-2">
          <button
            onClick={handleImportClick}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Import from Excel
          </button>
          <button
            onClick={() => {
              setEditingAccount(null);
              setIsEditModalOpen(true);
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Account
          </button>
        </div>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".xlsx, .xls"
          className="hidden"
        />
      </div>

      <div className="flex justify-end">
        <a 
          href="#" 
          onClick={(e) => { e.preventDefault(); downloadTemplate(); }}
          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 flex items-center gap-1"
        >
          <Download className="w-4 h-4" />
          Download Excel Template
        </a>
      </div>

      <div className="bg-card rounded-lg shadow">
        <div className="p-6">
          <div className="flex gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search accounts..."
                className="w-full pl-10 pr-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left border-b dark:border-gray-700">
                  <th className="pb-3 font-semibold">Code</th>
                  <th className="pb-3 font-semibold">Name</th>
                  <th className="pb-3 font-semibold">Alias Name</th>
                  <th className="pb-3 font-semibold">Category</th>
                  <th className="pb-3 font-semibold">Sub Category</th>
                  <th className="pb-3 font-semibold text-center">Zakat</th>
                  <th className="pb-3 font-semibold text-center">Cash Book</th>
                  <th className="pb-3 font-semibold">Currency</th>
                  <th className="pb-3 font-semibold text-center">Status</th>
                  <th className="pb-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-700">
                {filteredAccounts.map((account) => (
                  <tr key={account.id}>
                    <td className="py-3">{account.code}</td>
                    <td className="py-3">{account.name}</td>
                    <td className="py-3">{account.alias_name || '-'}</td>
                    <td className="py-3">{account.subcategory?.category.name}</td>
                    <td className="py-3">{account.subcategory?.name}</td>
                    <td className="py-3 text-center">
                      {account.zakat_eligible ? (
                        <span className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded dark:bg-green-900 dark:text-green-300">
                          Yes
                        </span>
                      ) : (
                        <span className="bg-gray-100 text-gray-800 text-xs font-medium px-2.5 py-0.5 rounded dark:bg-gray-700 dark:text-gray-300">
                          No
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-center">
                      {account.is_cashbook ? (
                        <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded dark:bg-blue-900 dark:text-blue-300">
                          Yes
                        </span>
                      ) : (
                        <span className="bg-gray-100 text-gray-800 text-xs font-medium px-2.5 py-0.5 rounded dark:bg-gray-700 dark:text-gray-300">
                          No
                        </span>
                      )}
                    </td>
                    <td className="py-3">
                      {account.currency?.code || '-'}
                    </td>
                    <td className="py-3 text-center">
                      {account.is_active ? (
                        <span className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded dark:bg-green-900 dark:text-green-300">
                          Active
                        </span>
                      ) : (
                        <span className="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded dark:bg-red-900 dark:text-red-300">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => handleEdit(account)}
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 font-medium"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredAccounts.length === 0 && (
                  <tr>
                    <td colSpan={10} className="py-4 text-center text-gray-500 dark:text-gray-400">
                      No accounts found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Showing {filteredAccounts.length} of {accounts.length} accounts
            </div>
          </div>
        </div>
      </div>

      <EditModal
        account={editingAccount}
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingAccount(null);
        }}
        onSave={handleSave}
        subCategories={subCategories}
        currencies={currencies}
      />
    </div>
  );
}