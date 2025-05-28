import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, X, AlertTriangle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';

interface Category {
  id: string;
  code: string;
  name: string;
}

interface SubCategory {
  id: string;
  code: string;
  name: string;
  description: string;
  category_id: string;
  category: Category;
}

interface EditModalProps {
  subCategory: SubCategory | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<SubCategory>) => Promise<void>;
  categories: Category[];
}

interface DeleteModalProps {
  subCategory: SubCategory | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

function DeleteModal({ subCategory, isOpen, onClose, onConfirm }: DeleteModalProps) {
  if (!isOpen || !subCategory) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-red-100 dark:bg-red-900 p-2 rounded-full">
            <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-300" />
          </div>
          <h2 className="text-xl font-semibold">Delete Sub Category</h2>
        </div>
        
        <div className="mb-6">
          <p className="text-gray-600 dark:text-gray-300 mb-2">
            Are you sure you want to delete the sub category "{subCategory.name}"?
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

function EditModal({ subCategory, isOpen, onClose, onSave, categories }: EditModalProps) {
  const [formData, setFormData] = useState<Partial<SubCategory>>({
    name: '',
    description: '',
    category_id: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (subCategory) {
      setFormData({
        name: subCategory.name,
        description: subCategory.description,
        category_id: subCategory.category_id
      });
    } else {
      setFormData({
        name: '',
        description: '',
        category_id: categories[0]?.id || ''
      });
    }
  }, [subCategory, categories]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error('Error saving sub category:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">
            {subCategory ? 'Edit Sub Category' : 'Add Sub Category'}
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
              Category
            </label>
            <select
              value={formData.category_id}
              onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            >
              <option value="">Select Category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
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
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={3}
            />
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

export default function SubCategories() {
  const [subCategories, setSubCategories] = useState<SubCategory[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [editingSubCategory, setEditingSubCategory] = useState<SubCategory | null>(null);
  const [deletingSubCategory, setDeletingSubCategory] = useState<SubCategory | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCategories();
    fetchSubCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('id, code, name')
        .order('name');

      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
      toast.error('Failed to fetch categories');
    }
  };

  const fetchSubCategories = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('subcategories')
        .select(`
          *,
          category:categories (
            id,
            code,
            name
          )
        `)
        .order('code');

      if (error) throw error;
      setSubCategories(data || []);
    } catch (error) {
      console.error('Error fetching sub categories:', error);
      setError('Failed to fetch sub categories');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (subCategory: SubCategory) => {
    setEditingSubCategory(subCategory);
    setIsEditModalOpen(true);
  };

  const handleDelete = (subCategory: SubCategory) => {
    setDeletingSubCategory(subCategory);
    setIsDeleteModalOpen(true);
  };

  const handleSave = async (subCategoryData: Partial<SubCategory>) => {
    try {
      if (editingSubCategory) {
        // Update existing sub category
        const { error } = await supabase
          .from('subcategories')
          .update({
            name: subCategoryData.name,
            description: subCategoryData.description,
            category_id: subCategoryData.category_id,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingSubCategory.id);

        if (error) throw error;
        toast.success('Sub category updated successfully');
      } else {
        // Generate a new code
        const newCode = `SUB${String(subCategories.length + 1).padStart(3, '0')}`;
        
        // Add new sub category
        const { error } = await supabase
          .from('subcategories')
          .insert({
            code: newCode,
            name: subCategoryData.name,
            description: subCategoryData.description,
            category_id: subCategoryData.category_id
          });

        if (error) throw error;
        toast.success('Sub category added successfully');
      }

      fetchSubCategories();
    } catch (error) {
      console.error('Error saving sub category:', error);
      toast.error('Failed to save sub category');
      throw error;
    }
  };

  const confirmDelete = async () => {
    if (!deletingSubCategory) return;

    try {
      const { error } = await supabase
        .from('subcategories')
        .delete()
        .eq('id', deletingSubCategory.id);

      if (error) throw error;

      setSubCategories(subCategories.filter((sc) => sc.id !== deletingSubCategory.id));
      toast.success('Sub category deleted successfully');
    } catch (error) {
      console.error('Error deleting sub category:', error);
      toast.error('Failed to delete sub category');
    } finally {
      setIsDeleteModalOpen(false);
      setDeletingSubCategory(null);
    }
  };

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedCategory('');
  };

  const filteredSubCategories = subCategories.filter((subCategory) => {
    const matchesSearch = 
      subCategory.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      subCategory.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      subCategory.description?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory = !selectedCategory || subCategory.category_id === selectedCategory;

    return matchesSearch && matchesCategory;
  });

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
        <h1 className="text-2xl font-semibold">Sub Categories</h1>
        <button
          onClick={() => {
            setEditingSubCategory(null);
            setIsEditModalOpen(true);
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Sub Category
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="p-6">
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search sub categories..."
                className="w-full pl-10 pr-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="flex gap-4">
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="pl-10 pr-4 py-2 border rounded-lg appearance-none bg-white dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All Categories</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={resetFilters}
                className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 dark:text-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
              >
                Reset Filters
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left border-b dark:border-gray-700">
                  <th className="pb-3 font-semibold">Code</th>
                  <th className="pb-3 font-semibold">Name</th>
                  <th className="pb-3 font-semibold">Category</th>
                  <th className="pb-3 font-semibold">Description</th>
                  <th className="pb-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-700">
                {filteredSubCategories.map((subCategory) => (
                  <tr key={subCategory.id}>
                    <td className="py-3">{subCategory.code}</td>
                    <td className="py-3">{subCategory.name}</td>
                    <td className="py-3">
                      <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded dark:bg-blue-900 dark:text-blue-300">
                        {subCategory.category?.name}
                      </span>
                    </td>
                    <td className="py-3">{subCategory.description}</td>
                    <td className="py-3 text-right space-x-2">
                      <button
                        onClick={() => handleEdit(subCategory)}
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(subCategory)}
                        className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-200 font-medium"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredSubCategories.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-gray-500 dark:text-gray-400">
                      No sub categories found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Showing {filteredSubCategories.length} of {subCategories.length} sub categories
            </div>
          </div>
        </div>
      </div>

      <EditModal
        subCategory={editingSubCategory}
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingSubCategory(null);
        }}
        onSave={handleSave}
        categories={categories}
      />

      <DeleteModal
        subCategory={deletingSubCategory}
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setDeletingSubCategory(null);
        }}
        onConfirm={confirmDelete}
      />
    </div>
  );
}