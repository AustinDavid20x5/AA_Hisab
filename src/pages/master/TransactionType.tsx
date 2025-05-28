import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface TransactionType {
  id: string;
  transaction_type_code: string;
  description: string;
}

interface DeleteModalProps {
  transactionType: TransactionType | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

function DeleteModal({ transactionType, isOpen, onClose, onConfirm }: DeleteModalProps) {
  if (!isOpen || !transactionType) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-red-100 dark:bg-red-900 p-2 rounded-full">
            <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-300" />
          </div>
          <h2 className="text-xl font-semibold">Delete Transaction Type</h2>
        </div>
        
        <div className="mb-6">
          <p className="text-gray-600 dark:text-gray-300 mb-2">
            Are you sure you want to delete the transaction type "{transactionType.transaction_type_code}"?
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

export default function TransactionType() {
  const [transactionTypes, setTransactionTypes] = useState<TransactionType[]>([]);
  const [formData, setFormData] = useState<Partial<TransactionType>>({
    transaction_type_code: '',
    description: '',
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingType, setDeletingType] = useState<TransactionType | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTransactionTypes();
  }, []);

  const fetchTransactionTypes = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('tbl_trans_type')
        .select('*')
        .order('transaction_type_code');

      if (error) throw error;
      setTransactionTypes(data || []);
    } catch (error) {
      console.error('Error fetching transaction types:', error);
      setError('Failed to fetch transaction types');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (type: TransactionType) => {
    setFormData({
      transaction_type_code: type.transaction_type_code,
      description: type.description,
    });
    setEditingId(type.id);
  };

  const handleDelete = (type: TransactionType) => {
    setDeletingType(type);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingType) return;

    try {
      const { error } = await supabase
        .from('tbl_trans_type')
        .delete()
        .eq('id', deletingType.id);

      if (error) throw error;

      setTransactionTypes(types => types.filter(t => t.id !== deletingType.id));
      toast.success('Transaction type deleted successfully');
    } catch (error) {
      console.error('Error deleting transaction type:', error);
      toast.error('Failed to delete transaction type');
    } finally {
      setIsDeleteModalOpen(false);
      setDeletingType(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Validate form data
      if (!formData.transaction_type_code || !formData.description) {
        toast.error('Please fill in all required fields');
        return;
      }

      if (editingId) {
        // Update existing record
        const { error } = await supabase
          .from('tbl_trans_type')
          .update({
            transaction_type_code: formData.transaction_type_code,
            description: formData.description,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingId);

        if (error) throw error;
        toast.success('Transaction type updated successfully');
      } else {
        // Add new record
        const { error } = await supabase
          .from('tbl_trans_type')
          .insert({
            transaction_type_code: formData.transaction_type_code,
            description: formData.description
          });

        if (error) throw error;
        toast.success('Transaction type added successfully');
      }

      // Reset form and refresh data
      handleCancel();
      fetchTransactionTypes();
    } catch (error) {
      console.error('Error saving transaction type:', error);
      toast.error('Failed to save transaction type');
    }
  };

  const handleCancel = () => {
    if (formData.transaction_type_code || formData.description) {
      if (confirm('Are you sure you want to clear the form?')) {
        setFormData({ transaction_type_code: '', description: '' });
        setEditingId(null);
      }
    } else {
      setFormData({ transaction_type_code: '', description: '' });
      setEditingId(null);
    }
  };

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
      <div>
        <h1 className="text-2xl font-semibold mb-6">Transaction Types</h1>

        {/* Entry Form */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Transaction Type Code *
                </label>
                <input
                  type="text"
                  value={formData.transaction_type_code}
                  onChange={(e) => setFormData({ ...formData, transaction_type_code: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                  maxLength={10}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description *
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 dark:text-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                {editingId ? 'Update' : 'Save'}
              </button>
            </div>
          </form>
        </div>

        {/* Grid */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left border-b dark:border-gray-700">
                    <th className="pb-3 font-semibold">Type Code</th>
                    <th className="pb-3 font-semibold">Description</th>
                    <th className="pb-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-700">
                  {transactionTypes.map((type) => (
                    <tr key={type.id}>
                      <td className="py-3">{type.transaction_type_code}</td>
                      <td className="py-3">{type.description}</td>
                      <td className="py-3 text-right space-x-2">
                        <button
                          onClick={() => handleEdit(type)}
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
                        >
                          <Pencil className="w-4 h-4 inline" />
                        </button>
                        <button
                          onClick={() => handleDelete(type)}
                          className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-200"
                        >
                          <Trash2 className="w-4 h-4 inline" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {transactionTypes.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-4 text-center text-gray-500 dark:text-gray-400">
                        No transaction types found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <DeleteModal
        transactionType={deletingType}
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setDeletingType(null);
        }}
        onConfirm={confirmDelete}
      />
    </div>
  );
}