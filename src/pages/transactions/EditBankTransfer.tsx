import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
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
  type_id: string;
  gl_transactions: {
    id: string;
    debit: number;
    credit: number;
    debit_doc_currency: number;
    credit_doc_currency: number;
    exchange_rate: number;
    amount: number;
    currency_id: string;
    purchase_rate: number | null;
    sales_rate: number | null;
    account: {
      id: string;
      name: string;
    };
    account_id: string;
  }[];
}

interface TransactionType {
  type_id: string;
  transaction_type_code: string;
  description: string;
}

export default function EditBankTransfer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [businessPartners, setBusinessPartners] = useState<BusinessPartner[]>([]);
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [customer, setCustomer] = useState<BusinessPartner | null>(null);
  const [supplier, setSupplier] = useState<BusinessPartner | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [voucherNo, setVoucherNo] = useState<string>('');
  const [transactionTypes, setTransactionTypes] = useState<TransactionType[]>([]);
  const [commissionAccountId, setCommissionAccountId] = useState<string>('');
  const [baseCurrencyId, setBaseCurrencyId] = useState<string | null>(null);
  const [currencies, setCurrencies] = useState<{ id: string; code: string }[]>([]);

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
    // Skip auto-calculation if we're editing an existing transaction
    //if (transaction) return;
    
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

        if (currencyError) {
          console.error('Error fetching currencies:', currencyError);
          toast.error('Failed to fetch currencies');
          return;
        }
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

        // Fetch commission account ID
        const { data: commissionAccount, error: commissionError } = await supabase
          .from('chart_of_accounts')
          .select('id')
          .eq('code', '0000000005')
          .single();

        if (commissionError) throw commissionError;
        const fetchedCommissionAccountId = commissionAccount.id;
        setCommissionAccountId(commissionAccount.id);

          // Fetch business partners
        const { data: subcategories, error: subcatError } = await supabase
          .from('subcategories')
          .select('id')
          .eq('name', 'Business Partner')
          .single();

        if (subcatError) {
          console.error('Error fetching subcategory:', subcatError);
          toast.error('Failed to fetch business partners');
          return;
        }

        const { data: partners, error: partnersError } = await supabase
          .from('chart_of_accounts')
          .select(`
            id,
            code,
            name
          `)
          .eq('is_active', true)
          .eq('subcategory_id', subcategories.id)
          .order('name');

        if (partnersError) throw partnersError;
        const fetchedPartners = partners || [];
        setBusinessPartners(fetchedPartners);

        // Then fetch transaction data
        if (id && commissionAccount.id) {
          await fetchTransaction(id);
        }
      } catch (error) {
        console.error('Error initializing component:', error);
        setError('Failed to initialize form');
      } finally {
        setIsLoading(false);
      }
    };

    initializeComponent();
  }, [id]);

  const fetchBusinessPartners = async () => {
    try {
      const { data: subcategories, error: subcatError } = await supabase
        .from('subcategories')
        .select('id')
        .eq('name', 'Business Partner')
        .single();

      if (subcatError) {
        console.error('Error fetching subcategory:', subcatError);
        toast.error('Failed to fetch business partners');
        return;
      }

      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select(`
          id,
          code,
          name
        `)
        .eq('is_active', true)
        .eq('subcategory_id', subcategories.id)
        .order('name');

      if (error) throw error;
      setBusinessPartners(data || []);
    } catch (error) {
      console.error('Error fetching business partners:', error);
      toast.error('Failed to fetch business partners');
    }
  };

  const fetchTransaction = async (transactionId: string) => {
    try {
      const { data, error } = await supabase
        .from('gl_headers')
        .select(`
          id,
          voucher_no,
          transaction_date,
          description,
          status,
          type_id,
          gl_transactions (
            id,
            debit,
            credit,
            debit_doc_currency,
            credit_doc_currency,
            amount,
            exchange_rate,
            currency_id,
            purchase_rate,
            sales_rate,
            account_id,
            account:chart_of_accounts (
              id,
              name
            )
          )
        `)
        .eq('id', transactionId)
        .single();

      if (error) throw error;
      
      setTransaction(data);
      setVoucherNo(data.voucher_no);

      // First find customer and supplier transactions
      const customerTrans = data.gl_transactions.find(t => 
        t.debit > 0 && t.account_id !== commissionAccountId
      );
      
      const supplierTrans = data.gl_transactions.find(t => t.credit > 0 && t.account_id !== commissionAccountId);
      
      // Set customer and supplier if found
      if (customerTrans && customerTrans.account) {
        setCustomer({
          id: customerTrans.account_id,
          code: '',
          name: customerTrans.account.name
        });
      }
      
      if (supplierTrans && supplierTrans.account) {
        setSupplier({
          id: supplierTrans.account_id,
          code: '',
          name: supplierTrans.account.name
        });
      }

      // Get commission amount from commission transaction, default to 0 if not found
      const commissionTrans = data.gl_transactions.find(t => {
        return (t.description && t.description.toLowerCase().includes('commission')) ||
               (t.account && t.account.name.toLowerCase().includes('commission')) &&
               t.credit > 0;
      });

      // Log the transaction data to debug
      console.log('Transaction data:', data);

      // Calculate amount (Supplier's Credit - Commission)
      const supplierCredit = supplierTrans ? supplierTrans.credit : 0;
      const commissionAmount = commissionTrans ? commissionTrans.credit : 0;
      const amount = supplierCredit - commissionAmount;

      // Get selling rate from transaction or calculate it
      const sellingRate = customerTrans?.sales_rate || 
      (customerTrans ? (customerTrans.debit / amount) * 100 : 0);
      
      // Get purchase rate from transaction or calculate it
      const purchaseRate = supplierTrans?.purchase_rate || 
      (supplierTrans ? (supplierTrans.credit / amount) * 100 : 0);
      
      // Set form data
      setFormData({
        date: data.transaction_date,
        narration: data.description,
        amount: customerTrans?.amount?.toString() || '0',
        sellingRate: sellingRate.toFixed(2),
        purchaseRate: purchaseRate.toFixed(2),
        commission: commissionAmount.toFixed(2),
        type: data.type_id
      });
    } catch (error) {
      console.error('Transaction fetch error:', error);
      if (error instanceof Error) {
        toast.error(`Failed to fetch transaction details: ${error.message}. Please check your network connection or try again later.`);
      } else {
        toast.error('Failed to fetch transaction details. Please ensure all required fields, especially "amount", are provided before submitting. If the problem persists, contact support.');
      }
      navigate('/transactions/bank');
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

    if (!transaction?.type_id) {
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

      // Update header
      const { error: headerError } = await supabase
        .from('gl_headers')
        .update({
          transaction_date: formData.date,
          description: formData.narration.toUpperCase(),
          updated_at: new Date().toISOString()
        })
        .eq('id', transaction.id);

      if (headerError) throw headerError;

      // Delete existing transactions
      const { error: deleteError } = await supabase
        .from('gl_transactions')
        .delete()
        .eq('header_id', transaction.id);

      if (deleteError) throw deleteError;

      // Create new transactions array
      const transactions = [
        {
          header_id: transaction.id,
          account_id: customer.id,
          debit: customerDebit,
          credit: 0,
          debit_doc_currency: customerDebit,
          credit_doc_currency: 0,
          exchange_rate: sellingRate,
          amount : amount,
          sales_rate: sellingRate,
          purchase_rate: null,
          currency_id: baseCurrencyId,
          description: formData.narration.toUpperCase()
        },
        {
          header_id: transaction.id,
          account_id: supplier.id,
          debit: 0,
          credit: supplierCredit,
          debit_doc_currency: 0,
          credit_doc_currency: supplierCredit,
          amount : amount,
          exchange_rate: purchaseRate,
          purchase_rate: purchaseRate,
          sales_rate: null,
          currency_id: baseCurrencyId,
          description: formData.narration.toUpperCase()
        }
      ];

      // Add commission transaction if applicable
      if (commission > 0) {
        transactions.push({
          header_id: transaction.id,
          account_id: commissionAccountId,
          debit: 0,
          credit: commission,
          debit_doc_currency: 0,
          credit_doc_currency: commission,
          amount : amount,
          exchange_rate: sellingRate,
          purchase_rate: purchaseRate,
          sales_rate: sellingRate,
          currency_id: baseCurrencyId,
          description: `COMMISSION FOR ${formData.narration.toUpperCase()}`
        });
      }

      // Insert transactions
      const { error: transError } = await supabase
        .from('gl_transactions')
        .insert(transactions);

      if (transError) throw transError;

      toast.success('Transaction updated successfully');
      navigate('/transactions/bank');
    } catch (error) {
      console.error('Error updating transaction:', error);
      toast.error('Failed to update transaction');
    }
  };

  const handleCancel = () => {
    navigate('/transactions/bank');
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
        <h1 className="text-2xl font-semibold">Edit Bank Transfer</h1>
      </div>
      
      {voucherNo && (
        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg mb-4">
          <p className="text-2xl font-bold text-blue-800 dark:text-blue-300">
            Voucher No: {voucherNo}
          </p>
        </div>
      )}

      {/* Entry Form */}
      <div className="bg-card rounded-lg shadow">
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
                  disabled={true}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-100 dark:bg-gray-600"
                  required
                >
                  {transactionTypes.map(type => (
                    <option key={type.type_id} value={type.type_id}>
                      {type.description}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Transaction type cannot be changed</p>
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
                  step="any"
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
                  step="any"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Commission
                </label>
                <input
                  type="number"
                  value={formData.commission}
                  onChange={(e) => setFormData({ ...formData, commission: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg bg-gray-100 dark:bg-gray-600 dark:border-gray-500"
                  step="0.01"
                  min="0"
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
                Update
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}