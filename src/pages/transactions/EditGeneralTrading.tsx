import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';

interface Currency {
  id: string;
  code: string;
  name: string;
  exchange_rate_note: 'multiply' | 'divide';
  rate: number;
  is_base: boolean;
}

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
    amount : number;
    exchange_rate: number;
    currency_id: string;
    account_id: string;
    account: {
      id: string;
      name: string;
    };
  }[];
}

export default function EditGeneralTrading() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [businessPartners, setBusinessPartners] = useState<BusinessPartner[]>([]);
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [selectedCurrency, setSelectedCurrency] = useState<Currency | null>(null);
  const [customer, setCustomer] = useState<BusinessPartner | null>(null);
  const [supplier, setSupplier] = useState<BusinessPartner | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commissionAccountId, setCommissionAccountId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    narration: '',
    amount: '',
    sellingRate: '',
    purchaseRate: '',
    commission: '0'
  });

  // Calculate commission when values change
  useEffect(() => {
    const amount = parseFloat(formData.amount);
    const sellingRate = parseFloat(formData.sellingRate);
    const purchaseRate = parseFloat(formData.purchaseRate);

    if (!isNaN(amount) && !isNaN(sellingRate) && !isNaN(purchaseRate) && selectedCurrency) {
      let commission = 0;

      if (selectedCurrency.exchange_rate_note === 'divide') {
        // For divide method, commission is based on the difference in reciprocal rates
        commission = Math.abs(amount * (1/purchaseRate - 1/sellingRate));
      } else {
        // For multiply method, commission is based on the difference in rates
        commission = Math.abs(amount * (sellingRate - purchaseRate));
      }
      setFormData(prev => ({ ...prev, commission: commission.toFixed(2) }));
    }
  }, [formData.amount, formData.sellingRate, formData.purchaseRate, selectedCurrency]);

  useEffect(() => {
    const initializeComponent = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Fetch currencies first
        const { data: currencyData, error: currenciesError } = await supabase
          .from('currencies')
          .select('id, code, name, exchange_rate_note, rate, is_base')
          .order('code');

        if (currenciesError) {
          console.error('Error fetching currencies:', currenciesError);
          toast.error('Failed to fetch currencies');
          return;
        }

        const fetchedCurrencies = currencyData || [];
        setCurrencies(fetchedCurrencies);

        // Fetch commission account ID
        const { data: commissionAccount, error: commissionError } = await supabase
          .from('chart_of_accounts')
          .select('id')
          .eq('code', '0000000005')
          .single();

        if (commissionError) throw commissionError;
        const fetchedCommissionAccountId = commissionAccount.id;
        setCommissionAccountId(fetchedCommissionAccountId);

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

        // Now fetch transaction data after all dependencies are loaded
        if (id) {
          await fetchTransaction(id, fetchedPartners, fetchedCurrencies, fetchedCommissionAccountId);
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

  // Function to calculate base amount based on exchange rate note
  const calculateBaseAmount = (docAmount: number, rate: number, method: 'multiply' | 'divide' | null): number => {
    if (method === 'divide') {
      return docAmount / rate;
    } else {
      return docAmount * rate;
    }
  };

  const fetchTransaction = async (
    transactionId: string, 
    partners: BusinessPartner[],
    currencyList: Currency[],
    commissionAccId: string
  ) => {
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
      
      // Find customer and supplier transactions
      const customerTrans = data.gl_transactions.find(t => t.debit > 0);
      const supplierTrans = data.gl_transactions.find(t => t.credit > 0 && t.account_id !== commissionAccId);
      const commissionTrans = data.gl_transactions.find(t => t.account_id === commissionAccId);
      
      // Find customer and supplier in the provided partners list
      const customerPartner = customerTrans ? 
        partners.find(bp => bp.id === customerTrans.account_id) : null;
      const supplierPartner = supplierTrans ? 
        partners.find(bp => bp.id === supplierTrans.account_id) : null;
      
      // Set customer and supplier
      if (customerPartner) setCustomer(customerPartner);
      if (supplierPartner) setSupplier(supplierPartner);
      
      // Find and set currency
      if (customerTrans) {
        const currency = currencyList.find(c => c.id === customerTrans.currency_id);
        if (currency) setSelectedCurrency(currency);
      }
      
      // Set form data
      setFormData({
        date: data.transaction_date,
        narration: data.description,
        amount: customerTrans?.amount?.toString() || '0',
        sellingRate: customerTrans?.exchange_rate?.toString() || '0',
        purchaseRate: supplierTrans?.exchange_rate?.toString() || '0',
        commission: commissionTrans ? (commissionTrans.credit_doc_currency.toString()) : '0'
      });
      
    } catch (error) {
      console.error('Error fetching transaction:', error);
      toast.error('Failed to fetch transaction details');
      navigate('/transactions/trading');
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

    if (!selectedCurrency) {
      toast.error('Please select a currency');
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

      // Calculate base currency amounts based on exchange_rate_note
      const customerDebit = calculateBaseAmount(amount, sellingRate, selectedCurrency.exchange_rate_note);
      const supplierCredit = calculateBaseAmount(amount, purchaseRate, selectedCurrency.exchange_rate_note);
      const commissionBase = calculateBaseAmount(commission, sellingRate, selectedCurrency.exchange_rate_note);

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
          debit_doc_currency: amount,
          credit_doc_currency: 0,
          exchange_rate: sellingRate,
          currency_id: selectedCurrency.id,
          description: formData.narration.toUpperCase(),
          amount: amount
        },
        {
          header_id: transaction.id,
          account_id: supplier.id,
          debit: 0,
          credit: supplierCredit,
          debit_doc_currency: 0,
          credit_doc_currency: amount,
          exchange_rate: purchaseRate,
          currency_id: selectedCurrency.id,
          description: formData.narration.toUpperCase(),
          amount: amount
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
          exchange_rate: sellingRate,
          currency_id: selectedCurrency.id,
          description: `COMMISSION FOR ${formData.narration.toUpperCase()}`
        });
      }

      // Insert transactions
      const { error: transError } = await supabase
        .from('gl_transactions')
        .insert(transactions);

      if (transError) throw transError;

      toast.success('Transaction updated successfully');
      navigate('/transactions/trading');
    } catch (error) {
      console.error('Error updating transaction:', error);
      toast.error('Failed to update transaction');
    }
  };

  const handleCancel = () => {
    navigate('/transactions/trading');
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
        <h1 className="text-2xl font-semibold">Edit General Trading</h1>
      </div>

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
                  Currency
                </label>
                <select
                  value={selectedCurrency?.id || ''}
                  onChange={(e) => {
                    const currency = currencies.find(c => c.id === e.target.value);
                    setSelectedCurrency(currency || null);
                  }}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="">Select Currency</option>
                  {currencies.map(currency => (
                    <option key={currency.id} value={currency.id}>
                      {currency.code} - {currency.name}
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
                  Selling Rate
                </label>
                <input
                  type="number"
                  value={formData.sellingRate}
                  onChange={(e) => setFormData({ ...formData, sellingRate: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  step="0.0001"
                  min="0.0001"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Purchase Rate
                </label>
                <input
                  type="number"
                  value={formData.purchaseRate}
                  onChange={(e) => setFormData({ ...formData, purchaseRate: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  step="0.0001"
                  min="0.0001"
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
                Update
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}