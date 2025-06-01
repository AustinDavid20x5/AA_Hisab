import React, { useState, useEffect } from 'react';
import { Plus, Search, X, AlertTriangle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase, verifyConnection } from '../../lib/supabase';

interface Currency {
  id: string;
  code: string;
  name: string;
  symbol: string;
  rate: number;
  is_base: boolean;
  exchange_rate_note: 'multiply' | 'divide' | null;
}

interface EditModalProps {
  currency: Currency | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (currencyData: Partial<Currency>) => Promise<void>;
}

interface DeleteModalProps {
  currency: Currency | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

function DeleteModal({ currency, isOpen, onClose, onConfirm }: DeleteModalProps) {
  if (!isOpen || !currency) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-red-100 dark:bg-red-900 p-2 rounded-full">
            <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-300" />
          </div>
          <h2 className="text-xl font-semibold">Delete Currency</h2>
        </div>
        
        <div className="mb-6">
          <p className="text-gray-600 dark:text-gray-300 mb-2">
            Are you sure you want to delete {currency.name} ({currency.code})?
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            This action cannot be undone.
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 dark:text-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function EditModal({ currency, isOpen, onClose, onSave }: EditModalProps) {
  const [formData, setFormData] = useState<Partial<Currency>>({
    code: '',
    name: '',
    symbol: '',
    rate: 1,
    is_base: false,
    exchange_rate_note: 'multiply'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (currency) {
      setFormData({
        code: currency.code,
        name: currency.name,
        symbol: currency.symbol,
        rate: currency.rate,
        is_base: currency.is_base,
        exchange_rate_note: currency.exchange_rate_note
      });
    } else {
      setFormData({
        code: '',
        name: '',
        symbol: '',
        rate: 1,
        is_base: false,
        exchange_rate_note: 'multiply'
      });
    }
  }, [currency]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error('Error saving currency:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">
            {currency ? 'Edit Currency' : 'Add Currency'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Code (4 characters)
            </label>
            <input
              type="text"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
              maxLength={4}
              pattern="[A-Z]{3,4}"
              title="Currency code must be 3 or 4 uppercase letters"
              disabled={!!currency}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Name
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Symbol
            </label>
            <input
              type="text"
              value={formData.symbol}
              onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Exchange Rate
            </label>
            <input
              type="number"
              value={formData.rate}
              onChange={(e) => setFormData({ ...formData, rate: parseFloat(e.target.value) || 1 })}
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              min="0.0001"
              step="0.0001"
              disabled={formData.is_base}
              required
            />
          </div>

          {!formData.is_base && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Exchange Rate Calculation
              </label>
              <select
                value={formData.exchange_rate_note || 'multiply'}
                onChange={(e) => setFormData({ ...formData, exchange_rate_note: e.target.value as 'multiply' | 'divide' })}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              >
                <option value="multiply">Multiply (Amount × Rate)</option>
                <option value="divide">Divide (Amount ÷ Rate)</option>
              </select>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {formData.exchange_rate_note === 'multiply' 
                  ? 'Use multiplication when the rate represents how many base currency units equal one unit of this currency'
                  : 'Use division when the rate represents how many units of this currency equal one base currency unit'
                }
              </p>
            </div>
          )}

          <div className="flex items-center">
            <input
              type="checkbox"
              id="is_base"
              checked={formData.is_base}
              onChange={(e) => {
                const isBase = e.target.checked;
                setFormData({ 
                  ...formData, 
                  is_base: isBase,
                  rate: isBase ? 1 : formData.rate,
                  exchange_rate_note: isBase ? null : 'multiply'
                });
              }}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
              disabled={!!currency}
            />
            <label htmlFor="is_base" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
              Base Currency
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

export default function Currency() {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingCurrency, setEditingCurrency] = useState<Currency | null>(null);
  const [deletingCurrency, setDeletingCurrency] = useState<Currency | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCurrencies();
  }, []);

  const fetchCurrencies = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // First verify the connection with better error handling
      try {
        await verifyConnection();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown connection error';
        throw new Error(`Connection error: ${errorMessage}`);
      }

      const { data, error, status } = await supabase
        .from('currencies')
        .select('*')
        .order('code');

      if (error) {
        if (status === 401) {
          throw new Error('Unauthorized: Please check your Supabase credentials and ensure you are connected to Supabase.');
        } else if (status === 403) {
          throw new Error('Forbidden: You do not have permission to access currencies.');
        } else if (error.message?.includes('relation "currencies" does not exist')) {
          throw new Error('The currencies table does not exist in your database. Please check your database schema.');
        } else {
          throw new Error(`Database error (${status}): ${error.message}`);
        }
      }

      setCurrencies(data || []);
    } catch (error) {
      console.error('Error fetching currencies:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch currencies';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (currency: Currency) => {
    setEditingCurrency(currency);
    setIsEditModalOpen(true);
  };

  const handleDelete = (currency: Currency) => {
    if (currency.is_base) {
      toast.error('Cannot delete base currency');
      return;
    }
    setDeletingCurrency(currency);
    setIsDeleteModalOpen(true);
  };

  const handleSave = async (currencyData: Partial<Currency>) => {
    try {
      // Ensure rate is always a valid number
      const rate = currencyData.is_base ? 1 : (parseFloat(String(currencyData.rate)) || 1);

      if (editingCurrency) {
        // Update existing currency
        const { error } = await supabase
          .from('currencies')
          .update({
            name: currencyData.name,
            symbol: currencyData.symbol,
            rate: rate,
            exchange_rate_note: currencyData.exchange_rate_note,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingCurrency.id);

        if (error) {
          if (error.message.includes('policy')) {
            throw new Error('You do not have permission to update currencies');
          }
          throw error;
        }
        
        toast.success('Currency updated successfully');
      } else {
        // Check if a base currency already exists when trying to add a new base currency
        if (currencyData.is_base) {
          const { data: existingBase } = await supabase
            .from('currencies')
            .select('id')
            .eq('is_base', true)
            .single();

          if (existingBase) {
            throw new Error('A base currency already exists');
          }
        }

        // Add new currency
        const { error } = await supabase
          .from('currencies')
          .insert({
            code: currencyData.code,
            name: currencyData.name,
            symbol: currencyData.symbol,
            rate: rate,
            is_base: currencyData.is_base,
            exchange_rate_note: currencyData.exchange_rate_note
          });

        if (error) {
          if (error.message.includes('policy')) {
            throw new Error('You do not have permission to add currencies');
          }
          throw error;
        }

        toast.success('Currency added successfully');
      }

      fetchCurrencies();
    } catch (error) {
      console.error('Error saving currency:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save currency');
      throw error;
    }
  };

  const confirmDelete = async () => {
    if (!deletingCurrency) return;

    try {
      const { error } = await supabase
        .from('currencies')
        .delete()
        .eq('id', deletingCurrency.id);

      if (error) {
        if (error.message.includes('policy')) {
          throw new Error('You do not have permission to delete currencies');
        }
        throw error;
      }

      setCurrencies(currencies.filter((c) => c.id !== deletingCurrency.id));
      toast.success('Currency deleted successfully');
    } catch (error) {
      console.error('Error deleting currency:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete currency');
    } finally {
      setIsDeleteModalOpen(false);
      setDeletingCurrency(null);
    }
  };

  const filteredCurrencies = currencies.filter(currency =>
    currency.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    currency.name.toLowerCase().includes(searchTerm.toLowerCase())
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
    <div className="space-y-6 min-h-screen bg-background">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Currency Management</h1>
        <button
          onClick={() => {
            setEditingCurrency(null);
            setIsEditModalOpen(true);
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Currency
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
                placeholder="Search currencies..."
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
                  <th className="pb-3 font-semibold">Symbol</th>
                  <th className="pb-3 font-semibold text-right">Exchange Rate</th>
                  <th className="pb-3 font-semibold text-center">Calculation</th>
                  <th className="pb-3 font-semibold text-center">Base Currency</th>
                  <th className="pb-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-700">
                {filteredCurrencies.map((currency) => (
                  <tr key={currency.id}>
                    <td className="py-3">{currency.code}</td>
                    <td className="py-3">{currency.name}</td>
                    <td className="py-3">{currency.symbol}</td>
                    <td className="py-3 text-right">{currency.rate?.toFixed(4) || '-'}</td>
                    <td className="py-3 text-center">
                      {currency.is_base ? (
                        <span className="text-gray-400">-</span>
                      ) : (
                        <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded dark:bg-blue-900 dark:text-blue-300">
                          {currency.exchange_rate_note === 'multiply' ? '×' : '÷'}
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-center">
                      {currency.is_base ? (
                        <span className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded dark:bg-green-900 dark:text-green-300">
                          Yes
                        </span>
                      ) : (
                        <span className="bg-gray-100 text-gray-800 text-xs font-medium px-2.5 py-0.5 rounded dark:bg-gray-700 dark:text-gray-300">
                          No
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-right space-x-2">
                      <button
                        onClick={() => handleEdit(currency)}
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 font-medium"
                      >
                        Edit
                      </button>
                      {!currency.is_base && (
                        <button
                          onClick={() => handleDelete(currency)}
                          className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-200 font-medium"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredCurrencies.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-4 text-center text-gray-500 dark:text-gray-400">
                      No currencies found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Showing {filteredCurrencies.length} of {currencies.length} currencies
            </div>
          </div>
        </div>
      </div>

      <EditModal
        currency={editingCurrency}
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingCurrency(null);
        }}
        onSave={handleSave}
      />

      <DeleteModal
        currency={deletingCurrency}
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setDeletingCurrency(null);
        }}
        onConfirm={confirmDelete}
      />
    </div>
  );
}