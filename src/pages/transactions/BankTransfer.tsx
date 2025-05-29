import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { Search, Edit } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

interface BusinessPartner {
  id: string;
  code: string;
  name: string;
}

interface Transaction {
  id: string;
  voucher_no: string;
  transaction_date: string;
  description: string;
  status: string;
  gl_transactions: {
    id: string;
    debit: number;
    credit: number;
    debit_doc_currency: number;
    credit_doc_currency: number;
    amount :number;
    exchange_rate: number;
    currency_id: string;
    purchase_rate: number | null;
    sales_rate: number | null;
    account: {
      id: string;
      name: string;
    };
  }[];
}

interface TransactionType {
  type_id: string;
  transaction_type_code: string;
  description: string;
}

export default function BankTransfer() {
  const navigate = useNavigate();
  const [businessPartners, setBusinessPartners] = useState<BusinessPartner[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [customer, setCustomer] = useState<BusinessPartner | null>(null);
  const [supplier, setSupplier] = useState<BusinessPartner | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transactionTypeId, setTransactionTypeId] = useState<string | null>(null);
  const [commissionAccountId, setCommissionAccountId] = useState<string | null>(null);
  const [baseCurrencyId, setBaseCurrencyId] = useState<string | null>(null);
  const [currencies, setCurrencies] = useState<{ id: string; code: string }[]>([]);
  const [transactionTypes, setTransactionTypes] = useState<TransactionType[]>([]);

  // State for transaction list pagination and filtering
  const [limit, setLimit] = useState(20);
  const [searchTerm, setSearchTerm] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    narration: '',
    amount: '',
    sellingRate: '',
    purchaseRate: '',
    commission: '0',
    type: ''
  });

  // Calculate commission when values change
  useEffect(() => {
    const amount = parseFloat(formData.amount);
   const sellingRate = parseFloat(formData.sellingRate);
    const purchaseRate = parseFloat(formData.purchaseRate);

    if (!isNaN(amount) && !isNaN(sellingRate) && !isNaN(purchaseRate)) {
      // Calculate commission based on rates per 100K
      const commission = (amount / 100000) * (sellingRate - purchaseRate);
      setFormData(prev => ({ ...prev, commission: commission.toFixed(2) }));
    }
  }, [formData.amount, formData.sellingRate, formData.purchaseRate]);

  useEffect(() => {
    const initializeComponent = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Get base currency ID
        const { data: baseCurrency, error: currencyError } = await supabase
          .from('currencies')
          .select('id')
          .eq('is_base', true)
          .single();

        if (currencyError) throw currencyError;
        setBaseCurrencyId(baseCurrency.id);

        // Fetch currencies
        const { data: currencyData, error: currenciesError } = await supabase
          .from('currencies')
          .select('id, code')
          .order('code');

        if (currenciesError) {
          console.error('Error fetching currencies:', currenciesError);
          toast.error('Failed to fetch currencies');
          return;
        }

        setCurrencies(currencyData || []);

        // Fetch transaction types
        const { data: types, error: typeError } = await supabase
          .from('tbl_trans_type')
          .select('type_id, transaction_type_code, description')
          .in('transaction_type_code', ['MNGC', 'BNKT']);

        if (typeError) throw typeError;
        setTransactionTypes(types);
        if (types.length > 0) {
          const typeId = types[0].type_id;
          setTransactionTypeId(typeId);
          setFormData(prev => ({ ...prev, type: typeId }));
        }

        // Fetch commission account ID
        const { data: commissionAccount, error: commissionError } = await supabase
          .from('chart_of_accounts')
          .select('id')
          .eq('code', '0000000005')
          .single();

        if (commissionError) throw commissionError;
        setCommissionAccountId(commissionAccount.id);

        await fetchBusinessPartners();
      } catch (error) {
        console.error('Error initializing component:', error);
        setError('Failed to initialize form');
      } finally {
        setIsLoading(false);
      }
    };

    initializeComponent();
  }, []);

  // Fetch transactions when transaction type is set
  useEffect(() => {
    if (transactionTypeId) {
      fetchTransactionsForType(transactionTypeId);
    }
  }, [transactionTypeId]);

  const fetchBusinessPartners = async () => {
    try {
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
        setBusinessPartners([]);
        return;
      }

      const subcategoryId = subcategories[0].id;

      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select(`
          id,
          code,
          name
        `)
        .eq('is_active', true)
        .eq('subcategory_id', subcategoryId)
        .order('name');

      if (error) throw error;
      setBusinessPartners(data || []);
    } catch (error) {
      console.error('Error fetching business partners:', error);
      toast.error('Failed to fetch business partners');
    }
  };

  const getCurrencyCode = (currencyId: string): string => {
    const currency = currencies.find(c => c.id === currencyId);
    return currency?.code || '';
  };

  const fetchTransactionsForType = async (typeId: string) => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('gl_headers')
        .select(`
          id,
          voucher_no,
          transaction_date,
          description,
          status,
          gl_transactions (
            id,
            debit,
            credit,
            debit_doc_currency,
            credit_doc_currency,
            exchange_rate,
            currency_id,
            purchase_rate,
            sales_rate,
            amount,
            account:chart_of_accounts (
              id,
              name
            )
          )
        `)
        .in('type_id', transactionTypes.map(t => t.type_id))
        .in('status', ['draft', 'posted'])
        .order('transaction_date', { ascending: false })
        .limit(limit);

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      toast.error('Failed to fetch transactions');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTransactions = () => {
    if (transactionTypeId) {
      fetchTransactionsForType(transactionTypeId);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!customer || !supplier) {
      toast.error('Please select both customer and supplier');
      return;
    }

    if (customer.id === supplier.id) {
      toast.error('Customer and supplier cannot be the same');
      return;
    }

    if (!transactionTypeId) {
      toast.error('Transaction type not configured');
      return;
    }

    if (!commissionAccountId) {
      toast.error('Commission account not configured');
      return;
    }

    if (!baseCurrencyId) {
      toast.error('Base currency not configured');
      return;
    }

    try {
      const amount = parseFloat(formData.amount);
      const sellingRate = parseFloat(formData.sellingRate);
      const purchaseRate = parseFloat(formData.purchaseRate);
      const commission = parseFloat(formData.commission);

      if (isNaN(amount) || amount <= 0) {
        toast.error('Please enter a valid amount');
        return;
      }

      if (isNaN(sellingRate) || isNaN(purchaseRate)) {
        toast.error('Please enter valid rates');
        return;
      }

      if (isNaN(commission)) {
        toast.error('Invalid commission calculation');
        return;
      }
      if (commission < 0) {
        toast.error('Commission cannot be negative');
        return;
      }
      
      // Calculate amounts
      const customerDebit = amount + (amount / 100000) * sellingRate;
      const supplierCredit = amount + (amount / 100000) * purchaseRate;
      

      // Create header
      const { data: header, error: headerError } = await supabase
        .from('gl_headers')
        .insert({
          transaction_date: formData.date,
          type_id: transactionTypeId,
          description: formData.narration.toUpperCase(),
          status: 'posted'
        })
        .select()
        .single();

      if (headerError) throw headerError;

      // Create transactions array
      const transactions = [
        {
          header_id: header.id,
          account_id: customer.id,
          debit: customerDebit,
          credit: 0,
          debit_doc_currency: customerDebit,
          credit_doc_currency: 0,
          exchange_rate: 1, // Store selling rate for record purposes
          sales_rate: sellingRate, // Store selling rate in dedicated field
          purchase_rate: 0, // Not applicable for customer transaction
          currency_id: baseCurrencyId,
          description: formData.narration.toUpperCase(),
          amount: amount
        },
        {
          header_id: header.id,
          account_id: supplier.id,
          debit: 0,
          credit: supplierCredit,
          debit_doc_currency: 0,
          credit_doc_currency: supplierCredit,
          exchange_rate: 1, // Store purchase rate for record purposes
          purchase_rate: purchaseRate, // Store purchase rate in dedicated field
          sales_rate: 0, // Not applicable for supplier transaction
          currency_id: baseCurrencyId,
          description: formData.narration.toUpperCase(),
          amount: amount
        }
      ];

      // Add commission transaction if applicable
      if (commission > 0) {
        transactions.push({
          header_id: header.id,
          account_id: commissionAccountId,
          debit: 0,
          credit: commission,
          debit_doc_currency: 0,
          credit_doc_currency: commission, // Pass commission directly without conversion
          exchange_rate: 1, // Store selling rate for record purposes
          purchase_rate: 1, // Store both rates for commission transaction
          sales_rate: 1,
          currency_id: baseCurrencyId,
          description: `COMMISSION FOR ${formData.narration.toUpperCase()}`,
          amount: amount
        });
      }

      // Insert transactions
      const { error: transError } = await supabase
        .from('gl_transactions')
        .insert(transactions);

      if (transError) {
        // Rollback by deleting the header
        await supabase
          .from('gl_headers')
          .delete()
          .eq('id', header.id);
        throw transError;
      }

      toast.success('Transaction saved successfully');
      
      // Reset form
      setFormData({
        date: new Date().toISOString().split('T')[0],
        narration: '',
        amount: '',
        sellingRate: '',
        purchaseRate: '',
        commission: '0',
        type: transactionTypeId
      });
      setCustomer(null);
      setSupplier(null);

      // Refresh transactions
      fetchTransactions();
    } catch (error) {
      console.error('Error saving transaction:', error);
      toast.error('Failed to save transaction');
    }
  };

  const handleCancel = () => {
    if (formData.narration || formData.amount || formData.sellingRate || formData.purchaseRate || customer || supplier) {
      if (confirm('Are you sure you want to clear the form?')) {
        setFormData({
          date: new Date().toISOString().split('T')[0],
          narration: '',
          amount: '',
          sellingRate: '',
          purchaseRate: '',
          commission: '0',
          type: transactionTypeId || ''
        });
        setCustomer(null);
        setSupplier(null);
      }
    }
  };

  const handleEdit = (transactionId: string) => {
    navigate(`/transactions/bank/edit/${transactionId}`);
  };

  // Helper function to get transaction details for debugging
  const logTransactionDetails = (transaction: Transaction) => {
    const customerTrans = transaction.gl_transactions.find(t => t.debit > 0);
    const supplierTrans = transaction.gl_transactions.find(t => t.credit > 0 && t.account_id !== commissionAccountId);
    const commissionTrans = transaction.gl_transactions.find(t => t.account_id === commissionAccountId);
    
    console.log('Transaction Details:', {
      id: transaction.id,
      date: transaction.transaction_date,
      description: transaction.description,
      customer: customerTrans?.account.name,
      supplier: supplierTrans?.account.name,
      amount: customerTrans?.amount,
      commission: commissionTrans?.credit
    });
  };

  const getTransactionAmount = (transaction: Transaction): number => {
    // Find the customer transaction (debit entry)
    const customerTransaction = transaction.gl_transactions.find(t => 
      t.account_id !== commissionAccountId && t.debit > 0
    );
    
    return customerTransaction?.amount || 0;

  };

  const getCustomerName = (transaction: Transaction): string => {
    // Find the customer transaction (debit entry)
    const customerTransaction = transaction.gl_transactions.find(t => 
      t.account_id !== commissionAccountId && t.debit > 0
    );
    
    return customerTransaction?.account.name || 'Unknown Customer';
  };

  const getSupplierName = (transaction: Transaction): string => {
    // Find the supplier transaction (credit entry)
    const supplierTransaction = transaction.gl_transactions.find(t => 
      t.account_id !== commissionAccountId && t.credit > 0
    );
    
    return supplierTransaction?.account.name || 'Unknown Supplier';
  };

  const getCommissionAmount = (transaction: Transaction): number => {
    // Find the commission transaction
    // First try to find by account ID
    let commissionTransaction = transaction.gl_transactions.find(t => 
      (t.account?.id === commissionAccountId || t.account_id === commissionAccountId) && t.credit > 0
    );
    
    // If not found, try to find by description containing "COMMISSION"
    if (!commissionTransaction) {
      commissionTransaction = transaction.gl_transactions.find(t => 
        t.description && t.description.includes('COMMISSION') && t.credit > 0
      );
    }
    
    // Log for debugging
    if (commissionTransaction) {
      console.log('Found commission transaction:', commissionTransaction);
    }
    
    return commissionTransaction?.credit || 0;
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
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Bank Transfer & Manager Cheque</h1>
      </div>

      {/* Entry Form */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  max={new Date().toISOString().split('T')[0]}
                  min={new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Transaction Type
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => {
                    const type = transactionTypes.find(t => t.type_id === e.target.value);
                    setTransactionTypeId(type?.type_id || null);
                    setFormData({ ...formData, type: e.target.value });
                  }}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  {transactionTypes.map(type => (
                    <option key={type.type_id} value={type.type_id}>
                      {type.description}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Customer
                </label>
                <select
                  value={customer?.id || ''}
                  onChange={(e) => {
                    const partner = businessPartners.find(bp => bp.id === e.target.value);
                    setCustomer(partner || null);
                  }}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="">Select Customer</option>
                  {businessPartners.map(bp => (
                    <option key={bp.id} value={bp.id}>
                      {bp.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Supplier
                </label>
                <select
                  value={supplier?.id || ''}
                  onChange={(e) => {
                    const partner = businessPartners.find(bp => bp.id === e.target.value);
                    setSupplier(partner || null);
                  }}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="">Select Supplier</option>
                  {businessPartners.map(bp => (
                    <option key={bp.id} value={bp.id}>
                      {bp.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Narration
                </label>
                <input
                  type="text"
                  value={formData.narration}
                  onChange={(e) => setFormData({ ...formData, narration: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  maxLength={100}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Amount
                </label>
                <input
                  type="number"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  step="0.01"
                  min="0.01"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Selling Rate Per 100k
                </label>
                <input
                  type="number"
                  value={formData.sellingRate}
                  onChange={(e) => setFormData({ ...formData, sellingRate: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  step="0.01"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Purchase Rate Per 100k
                </label>
                <input
                  type="number"
                  value={formData.purchaseRate}
                  onChange={(e) => setFormData({ ...formData, purchaseRate: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  step="0.01"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Commission
                </label>
                <input
                  type="text"
                  value={formData.commission}
                  className="w-full px-3 py-2 border rounded-lg bg-gray-100 dark:bg-gray-600 dark:border-gray-500"
                  readOnly
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
                Save
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="p-6">
          <h2 className="text-lg font-semibold mb-4">Recent Transactions</h2>
          
          <div className="mb-4 flex justify-between items-center">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search transactions..."
                className="w-full pl-10 pr-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <button
              onClick={fetchTransactions}
              className="px-4 py-2 text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 dark:text-blue-400 dark:bg-blue-900/20 dark:hover:bg-blue-900/30"
            >
              Refresh
            </button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left border-b dark:border-gray-700">
                  <th className="pb-3 font-semibold">Date</th>
                  <th className="pb-3 font-semibold">Voucher No</th>
                  <th className="pb-3 font-semibold">Customer</th>
                  <th className="pb-3 font-semibold">Supplier</th>
                  <th className="pb-3 font-semibold text-right">Amount</th>
                  <th className="pb-3 font-semibold text-right">Commission</th>
                  <th className="pb-3 font-semibold text-center">Actions</th>
                </tr>
              </thead>
              <tbody className={`divide-y dark:divide-gray-700 ${isLoading ? 'opacity-50' : ''}`}>
                {transactions
                  .filter(transaction => {
                    if (!searchTerm) return true;
                    const searchLower = searchTerm.toLowerCase();
                    const customerName = getCustomerName(transaction).toLowerCase();
                    const supplierName = getSupplierName(transaction).toLowerCase();
                    const voucherNo = transaction.voucher_no.toLowerCase();
                    const description = transaction.description.toLowerCase();
                    
                    return customerName.includes(searchLower) || 
                           supplierName.includes(searchLower) || 
                           voucherNo.includes(searchLower) ||
                           description.includes(searchLower);
                  })
                  .map((transaction) => {
                  // Log the transaction for debugging
                  console.log('Processing transaction:', transaction.voucher_no);
                  
                  const commission = getCommissionAmount(transaction);
                  const baseamount = getTransactionAmount(transaction);
                  const amount = baseamount; 
                  const customerName = getCustomerName(transaction);
                  const supplierName = getSupplierName(transaction);
                  
                  
                  // Log the calculated values
                  console.log('Commission for', transaction.voucher_no, ':', commission);
                  
                  const currencyCode = transaction.gl_transactions[0] ? 
                    getCurrencyCode(transaction.gl_transactions[0].currency_id) : '';
                  return (
                    <tr key={transaction.id}>
                      <td className="py-3">
                        {new Date(transaction.transaction_date).toLocaleDateString()}
                      </td>
                      <td className="py-3">{transaction.voucher_no}</td>
                      <td className="py-3">{customerName}</td>
                      <td className="py-3">{supplierName}</td>
                      <td className="py-3 text-right">
                        {currencyCode} {amount.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </td>
                      <td className="py-3 text-right">
                        {commission > 0 ? currencyCode : ''} {commission > 0 ? commission.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        }) : '-'}
                      </td>
                      <td className="py-3 text-center">
                        <button
                          onClick={() => handleEdit(transaction.id)}
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
                        >
                          <Edit className="w-4 h-4 inline" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-gray-500 dark:text-gray-400">
                      {isLoading ? (
                        <div className="flex justify-center items-center">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                          <span className="ml-2">Loading transactions...</span>
                        </div>
                      ) : (
                        'No transactions found'
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          {transactions.length > 0 && (
            <div className="mt-4 flex justify-between items-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Showing {transactions.length} transactions
              </p>
              <button
                onClick={() => {
                  setLimit(prev => prev + 20);
                  fetchTransactions();
                }}
                className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
              >
                Load more
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}