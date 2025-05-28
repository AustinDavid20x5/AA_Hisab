import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { formatAmount } from '../../lib/format';

interface Account {
  id: string;
  code: string;
  name: string;
  currency_id: string | null;
}

interface Currency {
  id: string;
  code: string;
  name: string;
  exchange_rate_note: 'multiply' | 'divide';
  rate: number;
  is_base: boolean;
}

interface TransactionLine {
  id: string;
  account: Account | null;
  currency: Currency | null;
  debit_doc: number;
  credit_doc: number;
  debit_local: number;
  credit_local: number;
  exchange_rate: number;
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
    currency_id: string;
    account_id: string;
    account: {
      id: string;
      name: string;
      code: string;
    };
  }[];
}

export default function EditJournalVoucher() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [lines, setLines] = useState<TransactionLine[]>([]);
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [narration, setNarration] = useState('');
  const [voucherNo, setVoucherNo] = useState('');
  const [dataInitialized, setDataInitialized] = useState(false);

  useEffect(() => {
    const initializeComponent = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Fetch accounts and currencies in parallel
        const [accountsResponse, currenciesResponse] = await Promise.all([
          supabase
            .from('chart_of_accounts')
            .select('id, code, name, currency_id')
            .eq('is_active', true)
            .order('code'),
          supabase
            .from('currencies')
            .select('id, code, name, rate, is_base, exchange_rate_note')
            .order('code')
        ]);

        if (accountsResponse.error) throw accountsResponse.error;
        if (currenciesResponse.error) throw currenciesResponse.error;

        const accountsData = accountsResponse.data || [];
        const currenciesData = currenciesResponse.data || [];
        
        setAccounts(accountsData);
        setCurrencies(currenciesData);
        
        // Fetch transaction data
        if (id) {
          await fetchTransaction(id, accountsData, currenciesData);
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

  const fetchTransaction = async (transactionId: string, accountsData: Account[], currenciesData: Currency[]) => {
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
            exchange_rate,
            currency_id,
            account_id,
            account:chart_of_accounts (
              id,
              name,
              code
            )
          )
        `)
        .eq('id', transactionId)
        .single();

      if (error) throw error;
      
      setTransaction(data);
      setDate(data.transaction_date);
      setNarration(data.description);
      setVoucherNo(data.voucher_no);
      
      // Convert gl_transactions to TransactionLine format
      const transactionLines: TransactionLine[] = data.gl_transactions.map(trans => {
        // Find the account and currency
        const account = accountsData.find(a => a.id === trans.account_id) || null;
        const currency = currenciesData.find(c => c.id === trans.currency_id) || null;
        
        // Determine if this is a debit or credit line
        const isDebit = trans.debit > 0;
        
        return {
          id: trans.id,
          account,
          currency,
          debit_doc: isDebit ? trans.debit_doc_currency : 0,
          credit_doc: !isDebit ? trans.credit_doc_currency : 0,
          debit_local: isDebit ? trans.debit : 0,
          credit_local: !isDebit ? trans.credit : 0,
          exchange_rate: trans.exchange_rate
        };
      });
      
      setLines(transactionLines);
      setDataInitialized(true);
    } catch (error) {
      console.error('Error fetching transaction:', error);
      toast.error('Failed to fetch transaction details');
      navigate('/transactions/jv');
    }
  };

  const calculateLocalAmount = (
    amount: number,
    currency: Currency | null,
    exchangeRate: number
  ): number => {
    if (!currency || amount === 0) return 0;
    if (currency.is_base) return amount;

    return currency.exchange_rate_note === 'multiply'
      ? amount * exchangeRate
      : amount / exchangeRate;
  };

  const addLine = () => {
    const baseCurrency = currencies.find(c => c.is_base);
    if (!baseCurrency) {
      toast.error('Base currency not configured');
      return;
    }

    const newLine: TransactionLine = {
      id: crypto.randomUUID(),
      account: null,
      currency: baseCurrency,
      debit_doc: 0,
      credit_doc: 0,
      debit_local: 0,
      credit_local: 0,
      exchange_rate: baseCurrency.rate
    };
    setLines([...lines, newLine]);
  };

  const removeLine = (id: string) => {
    setLines(lines.filter(line => line.id !== id));
  };

  const updateLine = (id: string, updates: Partial<TransactionLine>) => {
    setLines(lines.map(line => {
      if (line.id === id) {
        const updatedLine = { ...line, ...updates };

        // If updating currency, update exchange rate
        if ('currency' in updates && updates.currency) {
          updatedLine.exchange_rate = updates.currency.rate;
        }

        // If updating debit_doc, calculate debit_local and clear credit
        if ('debit_doc' in updates) {
          updatedLine.debit_doc = updates.debit_doc || 0;
          updatedLine.debit_local = calculateLocalAmount(
            updatedLine.debit_doc,
            updatedLine.currency,
            updatedLine.exchange_rate
          );
          updatedLine.credit_doc = 0;
          updatedLine.credit_local = 0;
        }

        // If updating credit_doc, calculate credit_local and clear debit
        if ('credit_doc' in updates) {
          updatedLine.credit_doc = updates.credit_doc || 0;
          updatedLine.credit_local = calculateLocalAmount(
            updatedLine.credit_doc,
            updatedLine.currency,
            updatedLine.exchange_rate
          );
          updatedLine.debit_doc = 0;
          updatedLine.debit_local = 0;
        }

        // If updating exchange_rate, recalculate local amounts
        if ('exchange_rate' in updates) {
          if (updatedLine.debit_doc > 0) {
            updatedLine.debit_local = calculateLocalAmount(
              updatedLine.debit_doc,
              updatedLine.currency,
              updatedLine.exchange_rate
            );
          } else if (updatedLine.credit_doc > 0) {
            updatedLine.credit_local = calculateLocalAmount(
              updatedLine.credit_doc,
              updatedLine.currency,
              updatedLine.exchange_rate
            );
          }
        }

        return updatedLine;
      }
      return line;
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!transaction) {
      toast.error('Transaction not found');
      return;
    }

    if (lines.length === 0) {
      toast.error('Please add at least one transaction line');
      return;
    }

    // Validate all required fields
    for (const line of lines) {
      if (!line.account) {
        toast.error('Please select an account for all lines');
        return;
      }

      if (!line.currency) {
        toast.error('Please select a currency for all lines');
        return;
      }

      if (line.debit_doc === 0 && line.credit_doc === 0) {
        toast.error('Please enter either debit or credit amount for all lines');
        return;
      }

      if (!line.exchange_rate || line.exchange_rate <= 0) {
        toast.error('Please enter a valid exchange rate for all lines');
        return;
      }
    }

    // Calculate totals in local currency
    const totalDebit = lines.reduce((sum, line) => sum + line.debit_local, 0);
    const totalCredit = lines.reduce((sum, line) => sum + line.credit_local, 0);

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      toast.error('Total debit must equal total credit');
      return;
    }

    try {
      // Update header
      const { error: headerError } = await supabase
        .from('gl_headers')
        .update({
          transaction_date: date,
          description: narration.toUpperCase(),
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

      // Create transactions array
      const transactions = lines.map(line => {
        if (!line.account?.id || !line.currency?.id) {
          throw new Error('Invalid line data');
        }

        return {
          header_id: transaction.id,
          account_id: line.account.id,
          currency_id: line.currency.id,
          debit: line.debit_local,
          credit: line.credit_local,
          debit_doc_currency: line.debit_doc,
          credit_doc_currency: line.credit_doc,
          exchange_rate: line.exchange_rate,
          description: narration.toUpperCase()
        };
      });

      // Insert transactions
      const { error: transError } = await supabase
        .from('gl_transactions')
        .insert(transactions);

      if (transError) throw transError;

      toast.success('Journal voucher updated successfully');
      navigate('/transactions/jv');
    } catch (error) {
      console.error('Error updating journal voucher:', error);
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error('Failed to update journal voucher');
      }
    }
  };

  const handleCancel = () => {
    navigate('/transactions/jv');
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

  if (isLoading || !dataInitialized) {
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
        <h1 className="text-2xl font-semibold">Edit Journal Voucher</h1>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Voucher No: <span className="font-medium">{voucherNo}</span>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Narration
                </label>
                <input
                  type="text"
                  value={narration}
                  onChange={(e) => setNarration(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  maxLength={100}
                  required
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left border-b dark:border-gray-700">
                    <th className="pb-3 font-semibold">Account</th>
                    <th className="pb-3 font-semibold">Currency</th>
                    <th className="pb-3 font-semibold text-right">Exchange Rate</th>
                    <th className="pb-3 font-semibold text-right">Debit (Doc)</th>
                    <th className="pb-3 font-semibold text-right">Credit (Doc)</th>
                    <th className="pb-3 font-semibold text-right">Debit (Local)</th>
                    <th className="pb-3 font-semibold text-right">Credit (Local)</th>
                    <th className="pb-3 font-semibold"></th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-700">
                  {lines.map((line) => (
                    <tr key={line.id}>
                      <td className="py-3">
                        <select
                          value={line.account?.id || ''}
                          onChange={(e) => {
                            const account = accounts.find(a => a.id === e.target.value);
                            updateLine(line.id, { account });
                          }}
                          className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          required
                        >
                          <option value="">Select Account</option>
                          {accounts.map(account => (
                            <option key={account.id} value={account.id}>
                              {account.code} - {account.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3">
                        <select
                          value={line.currency?.id || ''}
                          onChange={(e) => {
                            const currency = currencies.find(c => c.id === e.target.value);
                            updateLine(line.id, { currency });
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
                      </td>
                      <td className="py-3">
                        <input
                          type="number"
                          value={line.exchange_rate || ''}
                          onChange={(e) => updateLine(line.id, { exchange_rate: parseFloat(e.target.value) })}
                          className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-right"
                          step="0.0001"
                          min="0.0001"
                          required
                          disabled={line.currency?.is_base}
                        />
                      </td>
                      <td className="py-3">
                        <input
                          type="number"
                          value={line.debit_doc || ''}
                          onChange={(e) => updateLine(line.id, { debit_doc: parseFloat(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-right"
                          step="0.01"
                          min="0"
                        />
                      </td>
                      <td className="py-3">
                        <input
                          type="number"
                          value={line.credit_doc || ''}
                          onChange={(e) => updateLine(line.id, { credit_doc: parseFloat(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-right"
                          step="0.01"
                          min="0"
                        />
                      </td>
                      <td className="py-3 text-right">
                        {formatAmount(line.debit_local)}
                      </td>
                      <td className="py-3 text-right">
                        {formatAmount(line.credit_local)}
                      </td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() => removeLine(line.id)}
                          className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-200"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {lines.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-4 text-center text-gray-500 dark:text-gray-400">
                        No transactions added
                      </td>
                    </tr>
                  )}
                </tbody>
                {lines.length > 0 && (
                  <tfoot>
                    <tr className="border-t dark:border-gray-700 font-semibold">
                      <td colSpan={5} className="py-3 text-right">Total:</td>
                      <td className="py-3 text-right">{formatAmount(lines.reduce((sum, line) => sum + line.debit_local, 0))}</td>
                      <td className="py-3 text-right">{formatAmount(lines.reduce((sum, line) => sum + line.credit_local, 0))}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <div className="mt-4 flex justify-between">
              <button
                type="button"
                onClick={addLine}
                className="flex items-center gap-2 px-4 py-2 text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 dark:text-blue-400 dark:bg-blue-900/50 dark:hover:bg-blue-900/75"
              >
                <Plus className="w-4 h-4" />
                Add Line
              </button>

              <div className="flex gap-2">
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
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}