import React, { useState, useEffect } from 'react';
import { CreditCard, ArrowDownToLine, ArrowUpFromLine, Wallet, TrendingUp, Calendar, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatAmount } from '../lib/format';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
//import { startOfMonth, endOfMonth, format } from 'date-fns';

interface CashBookBalance {
  balance: number;
  currency_id: string;
  currency_code: string;
  base_balance?: number;
}

interface BusinessPartner {
  id: string;
  name: string;
  balance: number;
  currency_code: string;
}

interface Transaction {
  id: string;
  date: string;
  voucher_no: string;
  description: string;
  amount: number;
  currency_code: string;
  partner?: string;
  customer?: string;
  supplier?: string;
  commission?: number;
  transaction_type?: string;
}

interface CommissionSummary {
  transaction_type: string;
  description: string;
  total_commission: number;
}

interface Currency {
  id: string;
  code: string;
  rate: number;
  is_base: boolean;
  exchange_rate_note: 'multiply' | 'divide' | null;
}

export default function Dashboard() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cashBookBalances, setCashBookBalances] = useState<CashBookBalance[]>([]);
  const [topReceivables, setTopReceivables] = useState<BusinessPartner[]>([]);
  const [topPayables, setTopPayables] = useState<BusinessPartner[]>([]);
  const [topCommissionTransactions, setTopCommissionTransactions] = useState<Transaction[]>([]);
  const [commissionSummary, setCommissionSummary] = useState<CommissionSummary[]>([]);
  const [topCustomers, setTopCustomers] = useState<BusinessPartner[]>([]);
  const [topSuppliers, setTopSuppliers] = useState<BusinessPartner[]>([]);
  const [recentCashTransactions, setRecentCashTransactions] = useState<Transaction[]>([]);
  const [commissionComparison, setCommissionComparison] = useState({
    currentMonth: 0,
    previousMonth: 0,
    percentageChange: 0
  });
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());
  const [baseCurrency, setBaseCurrency] = useState<string>('AED');
  const [baseCurrencyId, setBaseCurrencyId] = useState<string>('');
  const [currencyRates, setCurrencyRates] = useState<Record<string, Currency>>({});
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Get all currencies and their rates
        const { data: currencies, error: currenciesError } = await supabase
          .from('currencies')
          .select('id, code, rate, is_base, exchange_rate_note');

        if (currenciesError) throw currenciesError;

        // Create a map of currency rates for easy lookup
        const ratesMap: Record<string, Currency> = {};
        let baseCurrencyCode = 'AED';
        let baseCurrencyIdValue = '';

        currencies.forEach(currency => {
          ratesMap[currency.id] = currency;
          if (currency.is_base) {
            baseCurrencyCode = currency.code;
            baseCurrencyIdValue = currency.id;
          }
        });

        setCurrencyRates(ratesMap);
        setBaseCurrency(baseCurrencyCode);
        setBaseCurrencyId(baseCurrencyIdValue);

        // Fetch all data in parallel
        await Promise.all([
          fetchCashBookBalances(ratesMap, baseCurrencyCode, baseCurrencyIdValue),
          fetchTopReceivables(),
          fetchTopPayables(),
          fetchTopCommissionTransactions(ratesMap, baseCurrencyCode, baseCurrencyIdValue),
          fetchCommissionSummary(),
          fetchTopCustomers(),
          fetchTopSuppliers(),
          fetchRecentCashTransactions(),
          fetchCommissionComparison()
        ]);

      } catch (error) {
        console.error('Error fetching dashboard data:', error);
        setError('Failed to load dashboard data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, [selectedMonth, refreshKey]);

  // Helper function to convert amount to base currency (only for specific sections)
  const convertToBaseCurrency = (
    amount: number, 
    currencyId: string, 
    ratesMap: Record<string, Currency>,
    baseCurrencyId: string
  ): number => {
    // If it's already in base currency, return as is
    if (currencyId === baseCurrencyId) return amount;

    const currency = ratesMap[currencyId];
    if (!currency) return amount; // Fallback if currency not found

    // Apply conversion based on exchange_rate_note
    if (currency.exchange_rate_note === 'multiply') {
      return amount * currency.rate;
    } else if (currency.exchange_rate_note === 'divide') {
      return amount / currency.rate;
    }

    return amount; // Default fallback
  };

  const fetchCashBookBalances = async (
    ratesMap: Record<string, Currency>,
    baseCurrencyCode: string,
    baseCurrencyId: string
  ) => {
    try {
      // First get all cash book accounts
      const { data: cashBooks, error: cashBooksError } = await supabase
        .from('chart_of_accounts')
        .select(`
          id,
          name,
          currency:currencies (
            id,
            code,
            rate,
            is_base,
            exchange_rate_note
          )
        `)
        .eq('is_cashbook', true)
        .eq('is_active', true);

      if (cashBooksError) throw cashBooksError;

      if (!cashBooks?.length) {
        setCashBookBalances([]);
        return;
      }

      // Get balances for each cash book
      const balances: CashBookBalance[] = [];
      
      for (const cashBook of cashBooks) {
        const { data: balanceData, error: balanceError } = await supabase
          .rpc('get_cash_book_doc_balance', {
            p_account_id: cashBook.id
          });

        if (balanceError) throw balanceError;

        if (balanceData?.length) {
          // Calculate base currency equivalent if not base currency
          balanceData.forEach((balance: CashBookBalance) => {
            const isBase = cashBook.currency.is_base;
            const rate = cashBook.currency.rate || 1;
            const exchangeRateNote = cashBook.currency.exchange_rate_note;

            // Calculate base currency equivalent
            if (!isBase) {
              balance.base_balance = exchangeRateNote === 'multiply'
                ? balance.balance * rate
                : balance.balance / rate;
            } else {
              balance.base_balance = balance.balance;
            }

            balances.push(balance);
          });
        }
      }

      setCashBookBalances(balances);
    } catch (error) {
      console.error('Error fetching cash book balances:', error);
      throw error;
    }
  };

  const fetchTopReceivables = async () => {
    try {
      // Get business partner subcategory
      const { data: subcategory, error: subcategoryError } = await supabase
        .from('subcategories')
        .select('id')
        .eq('name', 'Business Partner')
        .single();

      if (subcategoryError) throw subcategoryError;

      // Get all business partner accounts
      const { data: accounts, error: accountsError } = await supabase
        .from('chart_of_accounts')
        .select(`
          id,
          name,
          code
        `)
        .eq('subcategory_id', subcategory.id)
        .eq('is_active', true);

      if (accountsError) throw accountsError;

      if (!accounts?.length) {
        setTopReceivables([]);
        return;
      }

      // Calculate balance for each business partner
      const partners: BusinessPartner[] = [];

      for (const account of accounts) {
        const { data: transactions, error: transactionsError } = await supabase
          .from('gl_transactions')
          .select(`
            debit,
            credit,
            currencies!gl_transactions_currency_id_fkey (
              id,
              code
            ),
            header:gl_headers (
              status
            )
          `)
          .eq('account_id', account.id)
          .eq('header.status', 'posted');

        if (transactionsError) throw transactionsError;

        if (transactions?.length) {
          // Calculate total balance directly from debit and credit
          const totalBalance = transactions.reduce((sum, t) => {
            return sum + (t.debit || 0) - (t.credit || 0);
          }, 0);

          // Only include accounts with positive balance (receivables)
          if (totalBalance > 0) {
            partners.push({
              id: account.id,
              name: account.name,
              balance: totalBalance,
              currency_code: baseCurrency
            });
          }
        }
      }

      // Sort by balance descending and take top 10
      const topPartners = partners
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 10);

      setTopReceivables(topPartners);
    } catch (error) {
      console.error('Error fetching top receivables:', error);
      throw error;
    }
  };

  const fetchTopPayables = async () => {
    try {
      // Get business partner subcategory
      const { data: subcategory, error: subcategoryError } = await supabase
        .from('subcategories')
        .select('id')
        .eq('name', 'Business Partner')
        .single();

      if (subcategoryError) throw subcategoryError;

      // Get all business partner accounts
      const { data: accounts, error: accountsError } = await supabase
        .from('chart_of_accounts')
        .select(`
          id,
          name,
          code
        `)
        .eq('subcategory_id', subcategory.id)
        .eq('is_active', true);

      if (accountsError) throw accountsError;

      if (!accounts?.length) {
        setTopPayables([]);
        return;
      }

      // Calculate balance for each business partner
      const partners: BusinessPartner[] = [];

      for (const account of accounts) {
        const { data: transactions, error: transactionsError } = await supabase
          .from('gl_transactions')
          .select(`
            debit,
            credit,
            currencies!gl_transactions_currency_id_fkey (
              id,
              code
            ),
            header:gl_headers (
              status
            )
          `)
          .eq('account_id', account.id)
          .eq('header.status', 'posted');

        if (transactionsError) throw transactionsError;

        if (transactions?.length) {
          // Calculate total balance directly from debit and credit
          const totalBalance = transactions.reduce((sum, t) => {
            return sum + (t.debit || 0) - (t.credit || 0);
          }, 0);

          // Only include accounts with negative balance (payables)
          if (totalBalance < 0) {
            partners.push({
              id: account.id,
              name: account.name,
              balance: Math.abs(totalBalance), // Store as positive for display
              currency_code: baseCurrency
            });
          }
        }
      }

      // Sort by balance descending and take top 10
      const topPartners = partners
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 10);

      setTopPayables(topPartners);
    } catch (error) {
      console.error('Error fetching top payables:', error);
      throw error;
    }
  };

  const fetchTopCommissionTransactions = async (
    ratesMap: Record<string, Currency>,
    baseCurrencyCode: string,
    baseCurrencyId: string
  ) => {
    try {
      // Get commission account ID
      const { data: commissionAccount, error: commissionError } = await supabase
        .from('chart_of_accounts')
        .select('id')
        .eq('code', '0000000005')
        .single();

      if (commissionError) throw commissionError;

      const commissionAccountId = commissionAccount.id;

      // Get date range for current month
      const startDate = format(startOfMonth(selectedMonth), 'yyyy-MM-dd');
      const endDate = format(endOfMonth(selectedMonth), 'yyyy-MM-dd');

      // Get transactions with commission
      const { data: headers, error: headersError } = await supabase
        .from('gl_headers')
        .select(`
          id,
          voucher_no,
          transaction_date,
          description,
          tbl_trans_type!inner(transaction_type_code, description),
          gl_transactions(
            id,
            debit,
            credit,
            account_id,
            currency_id,
            currencies!gl_transactions_currency_id_fkey(
              id,
              code,
              rate,
              exchange_rate_note,
              is_base
            ),
            account:chart_of_accounts(
              id,
              name
            )
          )
        `)
        .gte('transaction_date', startDate)
        .lte('transaction_date', endDate)
        .eq('status', 'posted')
        .order('transaction_date', { ascending: false });

      if (headersError) throw headersError;

      if (!headers?.length) {
        setTopCommissionTransactions([]);
        return;
      }

      // Filter transactions that have commission entries
      const transactionsWithCommission = headers.filter(header => {
        return header.gl_transactions.some(t => t.account_id === commissionAccountId && t.credit > 0);
      });

      // Format transactions
      const formattedTransactions = transactionsWithCommission.map(header => {
        // Find commission transaction
        const commissionTrans = header.gl_transactions.find(
          t => t.account_id === commissionAccountId && t.credit > 0
        );

        // Find customer transaction (debit)
        const customerTrans = header.gl_transactions.find(
          t => t.debit > 0 && t.account_id !== commissionAccountId
        );

        // Find supplier transaction (credit)
        const supplierTrans = header.gl_transactions.find(
          t => t.credit > 0 && t.account_id !== commissionAccountId
        );

        // Get currency code and ID
        const currencyCode = commissionTrans?.currencies?.code || 
                            customerTrans?.currencies?.code || 
                            supplierTrans?.currencies?.code || 
                            baseCurrencyCode;
        
        const currencyId = commissionTrans?.currency_id || 
                          customerTrans?.currency_id || 
                          supplierTrans?.currency_id || 
                          baseCurrencyId;

        // Calculate customer amount (debit minus commission)
        const customerAmount = customerTrans ? customerTrans.debit - (commissionTrans?.credit || 0) : 0;
        const commission = commissionTrans?.credit || 0;
        
        // Convert to base currency if needed
        let baseCommission = commission;
        if (currencyId !== baseCurrencyId && currencyId) {
          baseCommission = convertToBaseCurrency(commission, currencyId, ratesMap, baseCurrencyId);
        }

        return {
          id: header.id,
          date: format(new Date(header.transaction_date), 'dd/MM/yyyy'),
          voucher_no: header.voucher_no,
          description: header.description,
          amount: customerAmount,
          currency_code: currencyCode,
          commission,
          transaction_type: header.tbl_trans_type.transaction_type_code,
          customer: customerTrans?.account?.name || '',
          supplier: supplierTrans?.account?.name || ''
        };
      });

      // Sort by commission amount and take top 10
      const topTransactions = formattedTransactions
        .filter(t => t.commission > 0) // Ensure we only include transactions with commission
        .sort((a, b) => b.commission - a.commission)
        .slice(0, 10);

      setTopCommissionTransactions(topTransactions);
    } catch (error) {
      console.error('Error fetching top commission transactions:', error);
      throw error;
    }
  };

  const fetchCommissionSummary = async () => {
    try {
      // Get commission account ID
      const { data: commissionAccount, error: commissionError } = await supabase
        .from('chart_of_accounts')
        .select('id')
        .eq('code', '0000000005')
        .single();

      if (commissionError) throw commissionError;

      const commissionAccountId = commissionAccount.id;

      // Get date range for current month
      const startDate = format(startOfMonth(selectedMonth), 'yyyy-MM-dd');
      const endDate = format(endOfMonth(selectedMonth), 'yyyy-MM-dd');

      // Get transaction types
      const { data: transactionTypes, error: typesError } = await supabase
        .from('tbl_trans_type')
        .select('type_id, transaction_type_code, description')
        .in('transaction_type_code', ['IPTC', 'GENT', 'MNGC', 'BNKT']);

      if (typesError) throw typesError;

      if (!transactionTypes?.length) {
        setCommissionSummary([]);
        return;
      }

      const summary: CommissionSummary[] = [];

      // For each transaction type, calculate total commission
      for (const type of transactionTypes) {
        const { data: transactions, error: transactionsError } = await supabase
          .from('gl_headers')
          .select(`
            id,
            gl_transactions(
              credit,
              account_id
            )
          `)
          .eq('type_id', type.type_id)
          .eq('status', 'posted')
          .gte('transaction_date', startDate)
          .lte('transaction_date', endDate);

        if (transactionsError) throw transactionsError;

        let totalCommission = 0;

        if (transactions?.length) {
          transactions.forEach(header => {
            const commissionTrans = header.gl_transactions.find(
              t => t.account_id === commissionAccountId && t.credit > 0
            );
            
            if (commissionTrans) {
              totalCommission += commissionTrans.credit;
            }
          });
        }

        // Always add the transaction type to the summary, even if commission is 0
        summary.push({
          transaction_type: type.transaction_type_code,
          description: type.description,
          total_commission: totalCommission
        });
      }

      // Sort by total commission descending
      const sortedSummary = summary.sort((a, b) => b.total_commission - a.total_commission);

      setCommissionSummary(sortedSummary);
    } catch (error) {
      console.error('Error fetching commission summary:', error);
      throw error;
    }
  };

  

  const fetchTopCustomers = async () => {
    try {
      const startDate = format(startOfMonth(selectedMonth), 'yyyy-MM-dd');
      const endDate = format(endOfMonth(selectedMonth), 'yyyy-MM-dd');
  
      const { data, error } = await supabase.rpc('fetch_top_customers', {
        input_start_date: startDate,
        input_end_date: endDate,
        input_subcategory_name: 'Business Partner',
        input_currency_code: 'AED'
      });
  
      if (error) throw error;
  
      setTopCustomers(data || []);
    } catch (err) {
      console.error('Error fetching top customers:', err.message);
      setTopCustomers([]);
    }
  };
      

  const fetchTopSuppliers = async () => {
    try {
      // Get start and end of selected month
      const startDate = format(startOfMonth(selectedMonth), 'yyyy-MM-dd');
      const endDate = format(endOfMonth(selectedMonth), 'yyyy-MM-dd');
  
      const { data, error } = await supabase.rpc('fetch_top_suppliers', {
        input_start_date: startDate,
        input_end_date: endDate,
        input_subcategory_name: 'Business Partner', // Suppliers fall under this subcategory
        input_currency_code: baseCurrency
      });
  
      if (error) {
        console.error('Error calling RPC:', error);
        toast.error('Failed to fetch top suppliers');
        return;
      }
  
      setTopSuppliers(data || []);
    } catch (err) {
      console.error('Unexpected error:', err);
      toast.error('Unexpected error occurred');
    }
  };
  

  const fetchRecentCashTransactions = async () => {
    try {
      // Get CASH transaction type ID
      const { data: cashType, error: typeError } = await supabase
        .from('tbl_trans_type')
        .select('type_id')
        .eq('transaction_type_code', 'CASH')
        .single();

      if (typeError) throw typeError;

      // Get recent cash transactions
      const { data: headers, error: headersError } = await supabase
        .from('gl_headers')
        .select(`
          id,
          voucher_no,
          transaction_date,
          description,
          gl_transactions(
            debit,
            credit,
            account:chart_of_accounts(id, name)
          )
        `)
        .eq('type_id', cashType.type_id)
        .eq('status', 'posted')
        .order('transaction_date', { ascending: false })
        .limit(5);

      if (headersError) throw headersError;

      if (!headers?.length) {
        setRecentCashTransactions([]);
        return;
      }

      // Format transactions
      const formattedTransactions = headers.map(header => {
        // Find cash book transaction
        const cashTrans = header.gl_transactions.find(
          t => t.account?.name && (t.debit > 0 || t.credit > 0)
        );

        // Find partner transaction
        const partnerTrans = header.gl_transactions.find(
          t => t.account?.id !== cashTrans?.account?.id
        );

        // Get amount (positive for debit, negative for credit)
        const amount = cashTrans?.debit ? cashTrans.debit : -(cashTrans?.credit || 0);

        return {
          id: header.id,
          date: format(new Date(header.transaction_date), 'dd/MM/yyyy'),
          voucher_no: header.voucher_no,
          description: header.description,
          amount,
          currency_code: baseCurrency,
          partner: partnerTrans?.account?.name || ''
        };
      });

      setRecentCashTransactions(formattedTransactions);
    } catch (error) {
      console.error('Error fetching recent cash transactions:', error);
      throw error;
    }
  };

  const fetchCommissionComparison = async () => {
    try {
      // Get commission account ID
      const { data: commissionAccount, error: commissionError } = await supabase
        .from('chart_of_accounts')
        .select('id')
        .eq('code', '0000000005')
        .single();

      if (commissionError) throw commissionError;

      const commissionAccountId = commissionAccount.id;

      // Get date range for current month
      const currentMonthStart = format(startOfMonth(selectedMonth), 'yyyy-MM-dd');
      const currentMonthEnd = format(endOfMonth(selectedMonth), 'yyyy-MM-dd');

      // Get date range for previous month
      const previousMonth = subMonths(selectedMonth, 1);
      const previousMonthStart = format(startOfMonth(previousMonth), 'yyyy-MM-dd');
      const previousMonthEnd = format(endOfMonth(previousMonth), 'yyyy-MM-dd');

      // Get current month commission
      const { data: currentMonthData, error: currentMonthError } = await supabase
        .from('gl_transactions')
        .select(`
          credit,
          header:gl_headers(
            transaction_date,
            status
          )
        `)
        .eq('account_id', commissionAccountId)
        .eq('header.status', 'posted')
        .gte('header.transaction_date', currentMonthStart)
        .lte('header.transaction_date', currentMonthEnd);

      if (currentMonthError) throw currentMonthError;

      // Get previous month commission
      const { data: previousMonthData, error: previousMonthError } = await supabase
        .from('gl_transactions')
        .select(`
          credit,
          header:gl_headers(
            transaction_date,
            status
          )
        `)
        .eq('account_id', commissionAccountId)
        .eq('header.status', 'posted')
        .gte('header.transaction_date', previousMonthStart)
        .lte('header.transaction_date', previousMonthEnd);

      if (previousMonthError) throw previousMonthError;

      // Calculate total commission for current month
      let currentMonthCommission = 0;
      if (currentMonthData?.length) {
        currentMonthCommission = currentMonthData.reduce((sum, t) => sum + (t.credit || 0), 0);
      }

      // Calculate total commission for previous month
      let previousMonthCommission = 0;
      if (previousMonthData?.length) {
        previousMonthCommission = previousMonthData.reduce((sum, t) => sum + (t.credit || 0), 0);
      }

      // Calculate percentage change
      let percentageChange = 0;
      if (previousMonthCommission > 0) {
        percentageChange = ((currentMonthCommission - previousMonthCommission) / previousMonthCommission) * 100;
      }

      setCommissionComparison({
        currentMonth: currentMonthCommission,
        previousMonth: previousMonthCommission,
        percentageChange
      });
    } catch (error) {
      console.error('Error fetching commission comparison:', error);
      throw error;
    }
  };

  const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const date = new Date(e.target.value);
    setSelectedMonth(date);
  };

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Dashboard</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            <input
              type="month"
              value={format(selectedMonth, 'yyyy-MM')}
              onChange={handleMonthChange}
              className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <button
            onClick={handleRefresh}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
            title="Refresh data"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>
      
      {/* Cash Book Balances */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="p-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Cash Book Balances</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {isLoading ? (
              Array(4).fill(0).map((_, i) => (
                <div key={i} className="animate-pulse bg-gray-200 dark:bg-gray-700 p-6 rounded-lg h-24"></div>
              ))
            ) : cashBookBalances.length > 0 ? (
              cashBookBalances.map((balance, index) => (
                <div key={index} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6 rounded-lg shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Balance ({balance.currency_code})</p>
                      <p className={`text-2xl font-semibold ${balance.balance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {formatAmount(balance.balance)}
                      </p>
                    </div>
                    <div className={`p-3 rounded-full ${balance.balance >= 0 ? 'bg-green-100 dark:bg-green-900' : 'bg-red-100 dark:bg-red-900'}`}>
                      <Wallet className={`w-6 h-6 ${balance.balance >= 0 ? 'text-green-600 dark:text-green-300' : 'text-red-600 dark:text-red-300'}`} />
                    </div>
                  </div>
                  {balance.base_balance !== undefined && balance.currency_code !== baseCurrency && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                      {baseCurrency} Equivalent: {formatAmount(balance.base_balance)}
                    </p>
                  )}
                </div>
              ))
            ) : (
              <div className="col-span-4 text-center py-4 text-gray-500 dark:text-gray-400">
                No cash book balances found
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Top Receivables and Payables */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Receivables */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <ArrowDownToLine className="w-5 h-5 text-green-600 dark:text-green-400" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Top Receivables</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left border-b dark:border-gray-700">
                    <th className="pb-3 font-semibold text-gray-900 dark:text-gray-100">Business Partner</th>
                    <th className="pb-3 font-semibold text-right text-gray-900 dark:text-gray-100">{baseCurrency}</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-700">
                  {isLoading ? (
                    Array(5).fill(0).map((_, i) => (
                      <tr key={i}>
                        <td className="py-3">
                          <div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-4 w-3/4 rounded"></div>
                        </td>
                        <td className="py-3 text-right">
                          <div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-4 w-1/2 ml-auto rounded"></div>
                        </td>
                      </tr>
                    ))
                  ) : topReceivables.length > 0 ? (
                    topReceivables.map((partner, index) => (
                      <tr key={index}>
                        <td className="py-3 text-gray-900 dark:text-gray-300">{partner.name}</td>
                        <td className="py-3 text-right text-green-600 dark:text-green-400 font-medium">
                          {formatAmount(partner.balance)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={2} className="py-4 text-center text-gray-500 dark:text-gray-400">
                        No receivables found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        
        {/* Top Payables */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <ArrowUpFromLine className="w-5 h-5 text-red-600 dark:text-red-400" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Top Payables</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left border-b dark:border-gray-700">
                    <th className="pb-3 font-semibold text-gray-900 dark:text-gray-100">Business Partner</th>
                    <th className="pb-3 font-semibold text-right text-gray-900 dark:text-gray-100">{baseCurrency}</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-700">
                  {isLoading ? (
                    Array(5).fill(0).map((_, i) => (
                      <tr key={i}>
                        <td className="py-3">
                          <div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-4 w-3/4 rounded"></div>
                        </td>
                        <td className="py-3 text-right">
                          <div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-4 w-1/2 ml-auto rounded"></div>
                        </td>
                      </tr>
                    ))
                  ) : topPayables.length > 0 ? (
                    topPayables.map((partner, index) => (
                      <tr key={index}>
                        <td className="py-3 text-gray-900 dark:text-gray-300">{partner.name}</td>
                        <td className="py-3 text-right text-red-600 dark:text-red-400 font-medium">
                          {formatAmount(partner.balance)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={2} className="py-4 text-center text-gray-500 dark:text-gray-400">
                        No payables found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      
      {/* Top Commission Transactions */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="p-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Top Transactions by Commission</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left border-b dark:border-gray-700">
                  <th className="pb-3 font-semibold text-gray-900 dark:text-gray-100">Date</th>
                  <th className="pb-3 font-semibold text-gray-900 dark:text-gray-100">Voucher</th>
                  <th className="pb-3 font-semibold text-gray-900 dark:text-gray-100">Description</th>
                  <th className="pb-3 font-semibold text-gray-900 dark:text-gray-100">Type</th>
                  <th className="pb-3 font-semibold text-right text-gray-900 dark:text-gray-100">{baseCurrency} Commission</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-700">
                {isLoading ? (
                  Array(5).fill(0).map((_, i) => (
                    <tr key={i}>
                      <td className="py-3">
                        <div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-4 w-20 rounded"></div>
                      </td>
                      <td className="py-3">
                        <div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-4 w-24 rounded"></div>
                      </td>
                      <td className="py-3">
                        <div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-4 w-40 rounded"></div>
                      </td>
                      <td className="py-3">
                        <div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-4 w-16 rounded"></div>
                      </td>
                      <td className="py-3 text-right">
                        <div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-4 w-20 ml-auto rounded"></div>
                      </td>
                    </tr>
                  ))
                ) : topCommissionTransactions.length > 0 ? (
                  //topCommissionTransactions.map((transaction, index) => (
                    topCommissionTransactions.slice(0, 5).map((transaction, index) => (
                    <tr key={index}>
                      <td className="py-3 text-gray-900 dark:text-gray-300">{transaction.date}</td>
                      <td className="py-3 text-gray-900 dark:text-gray-300">{transaction.voucher_no}</td>
                      <td className="py-3 text-gray-900 dark:text-gray-300">{transaction.description}</td>
                      <td className="py-3 text-gray-900 dark:text-gray-300">
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                          {transaction.transaction_type}
                        </span>
                      </td>
                      <td className="py-3 text-right font-medium text-green-600 dark:text-green-400">
                        {formatAmount(transaction.commission)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-gray-500 dark:text-gray-400">
                      No commission transactions found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
      {/* Commission Summary and Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Category-wise Commission Summary */}
        <div className="md:col-span-2 bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Commission by Transaction Type</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left border-b dark:border-gray-700">
                    <th className="pb-3 font-semibold text-gray-900 dark:text-gray-100">Type</th>
                    <th className="pb-3 font-semibold text-gray-900 dark:text-gray-100">Description</th>
                    <th className="pb-3 font-semibold text-right text-gray-900 dark:text-gray-100">Commission ({baseCurrency})</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-700">
                  {isLoading ? (
                    Array(4).fill(0).map((_, i) => (
                      <tr key={i}>
                        <td className="py-3">
                          <div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-4 w-16 rounded"></div>
                        </td>
                        <td className="py-3">
                          <div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-4 w-40 rounded"></div>
                        </td>
                        <td className="py-3 text-right">
                          <div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-4 w-20 ml-auto rounded"></div>
                        </td>
                      </tr>
                    ))
                  ) : commissionSummary.length > 0 ? (
                    commissionSummary.map((item, index) => (
                      <tr key={index}>
                        <td className="py-3 text-gray-900 dark:text-gray-300">{item.transaction_type}</td>
                        <td className="py-3 text-gray-900 dark:text-gray-300">{item.description}</td>
                        <td className="py-3 text-right font-medium text-green-600 dark:text-green-400">
                          {formatAmount(item.total_commission)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="py-4 text-center text-gray-500 dark:text-gray-400">
                        No commission data found
                      </td>
                    </tr>
                  )}
                  {commissionSummary.length > 0 && (
                    <tr className="font-semibold">
                      <td className="py-3 text-gray-900 dark:text-gray-300" colSpan={2}>Total</td>
                      <td className="py-3 text-right text-green-600 dark:text-green-400">
                        {formatAmount(commissionSummary.reduce((sum, item) => sum + item.total_commission, 0))}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        
        {/* Commission Comparison */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Commission Comparison</h2>
            {isLoading ? (
              <div className="animate-pulse space-y-4">
                <div className="bg-gray-200 dark:bg-gray-700 h-16 rounded"></div>
                <div className="bg-gray-200 dark:bg-gray-700 h-16 rounded"></div>
                <div className="bg-gray-200 dark:bg-gray-700 h-16 rounded"></div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                  <p className="text-sm text-green-600 dark:text-green-400">Current Month</p>
                  <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                    {baseCurrency} {formatAmount(commissionComparison.currentMonth)}
                  </p>
                </div>
                
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <p className="text-sm text-blue-600 dark:text-blue-400">Previous Month</p>
                  <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                    {baseCurrency} {formatAmount(commissionComparison.previousMonth)}
                  </p>
                </div>
                
                <div className={`p-4 rounded-lg ${
                  commissionComparison.percentageChange >= 0 
                    ? 'bg-green-50 dark:bg-green-900/20' 
                    : 'bg-red-50 dark:bg-red-900/20'
                }`}>
                  <p className={`text-sm ${
                    commissionComparison.percentageChange >= 0 
                      ? 'text-green-600 dark:text-green-400' 
                      : 'text-red-600 dark:text-red-400'
                  }`}>
                    Change
                  </p>
                  <div className="flex items-center gap-2">
                    <p className={`text-2xl font-bold ${
                      commissionComparison.percentageChange >= 0 
                        ? 'text-green-700 dark:text-green-300' 
                        : 'text-red-700 dark:text-red-300'
                    }`}>
                      {commissionComparison.percentageChange >= 0 ? '+' : ''}
                      {commissionComparison.percentageChange.toFixed(2)}%
                    </p>
                    {commissionComparison.percentageChange !== 0 && (
                      <TrendingUp className={`w-5 h-5 ${
                        commissionComparison.percentageChange >= 0 
                          ? 'text-green-600 dark:text-green-400' 
                          : 'text-red-600 dark:text-red-400'
                      }`} />
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Top Customers and Suppliers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Customers */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Top Customers by Revenue</h2>
            <div className="space-y-4">
              {isLoading ? (
                Array(5).fill(0).map((_, i) => (
                  <div key={i} className="animate-pulse flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700"></div>
                      <div>
                        <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
                      </div>
                    </div>
                    <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded"></div>
                  </div>
                ))
              ) : topCustomers.length > 0 ? (
                topCustomers.map((customer, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                        <span className="text-blue-600 dark:text-blue-300 font-medium">{index + 1}</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{customer.name}</p>
                      </div>
                    </div>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {formatAmount(customer.balance)}
                    </p>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                  No customer data found
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Top Suppliers */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Top Suppliers by Payments</h2>
            <div className="space-y-4">
              {isLoading ? (
                Array(5).fill(0).map((_, i) => (
                  <div key={i} className="animate-pulse flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700"></div>
                      <div>
                        <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
                      </div>
                    </div>
                    <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded"></div>
                  </div>
                ))
              ) : topSuppliers.length > 0 ? (
                topSuppliers.map((supplier, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
                        <span className="text-purple-600 dark:text-purple-300 font-medium">{index + 1}</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{supplier.name}</p>
                      </div>
                    </div>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {formatAmount(supplier.balance)}
                    </p>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                  No supplier data found
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Recent Cash Transactions */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="p-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Recent Cash Transactions</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left border-b dark:border-gray-700">
                  <th className="pb-3 font-semibold text-gray-900 dark:text-gray-100">Date</th>
                  <th className="pb-3 font-semibold text-gray-900 dark:text-gray-100">Voucher No</th>
                  <th className="pb-3 font-semibold text-gray-900 dark:text-gray-100">Description</th>
                  <th className="pb-3 font-semibold text-gray-900 dark:text-gray-100">Partner</th>
                  <th className="pb-3 font-semibold text-right text-gray-900 dark:text-gray-100">{baseCurrency}</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-700">
                {isLoading ? (
                  Array(5).fill(0).map((_, i) => (
                    <tr key={i}>
                      <td className="py-3">
                        <div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-4 w-20 rounded"></div>
                      </td>
                      <td className="py-3">
                        <div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-4 w-24 rounded"></div>
                      </td>
                      <td className="py-3">
                        <div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-4 w-40 rounded"></div>
                      </td>
                      <td className="py-3">
                        <div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-4 w-32 rounded"></div>
                      </td>
                      <td className="py-3 text-right">
                        <div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-4 w-20 ml-auto rounded"></div>
                      </td>
                    </tr>
                  ))
                ) : recentCashTransactions.length > 0 ? (
                  recentCashTransactions.map((transaction, index) => (
                    <tr key={index}>
                      <td className="py-3 text-gray-900 dark:text-gray-300">{transaction.date}</td>
                      <td className="py-3 text-gray-900 dark:text-gray-300">{transaction.voucher_no}</td>
                      <td className="py-3 text-gray-900 dark:text-gray-300">{transaction.description}</td>
                      <td className="py-3 text-gray-900 dark:text-gray-300">{transaction.partner}</td>
                      <td className={`py-3 text-right font-medium ${
                        transaction.amount >= 0 
                          ? 'text-green-600 dark:text-green-400' 
                          : 'text-red-600 dark:text-red-400'
                      }`}>
                        {formatAmount(Math.abs(transaction.amount))}
                        {transaction.amount < 0 ? ' (Cr)' : ' (Dr)'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-gray-500 dark:text-gray-400">
                      No recent cash transactions found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}