import React, { useState, useEffect, useMemo, useCallback, memo, Component } from 'react';
import { CreditCard, ArrowDownToLine, ArrowUpFromLine, Wallet, TrendingUp, RefreshCw, Users, Building2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { supabase } from '../lib/supabase';
import { formatAmount } from '../lib/format';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
//import { startOfMonth, endOfMonth, format } from 'date-fns';

interface CashBookBalance {
  balance: number;
  currency_id: string;
  currency_code: string;
  base_balance?: number;
  cashbook_name?: string;
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

// Memoized components for better performance
const CashBookBalancesSection = memo(({ balances, baseCurrency, formatAmount }: { 
  balances: any[]; 
  baseCurrency: string; 
  formatAmount: (amount: number) => string; 
}) => {
  const totalAEDBalance = balances.reduce((total, balance) => {
    return total + (balance.base_balance !== undefined ? balance.base_balance : balance.balance);
  }, 0);

  return (
    <Card className="overflow-hidden border-0 shadow-2xl transform transition-all duration-500 hover:shadow-3xl hover:-translate-y-1 bg-gradient-to-br from-background via-background to-muted/20 backdrop-blur-sm animate-fade-in-up">
      <CardHeader className="bg-gradient-to-r from-primary/15 to-primary/8 border-b border-border/50 backdrop-blur-sm relative overflow-hidden py-3 rounded-t-lg">
        <div className="flex items-center justify-between relative z-10">
          <CardTitle className="text-lg font-bold text-foreground flex items-center gap-2 drop-shadow-sm">
            <Wallet className="w-5 h-5" style={{color: '#3b82f6'}} />
            Cash Book Balances
          </CardTitle>
          <div className="text-right bg-background/90 backdrop-blur-sm rounded-lg p-2.5 shadow-lg border border-border/50 hover:border-primary/30 transition-all duration-300 hover:shadow-xl">
            <p className="text-xs font-medium text-muted-foreground">Total {baseCurrency} Balance</p>
            <p className={`text-xl font-bold drop-shadow-sm ${
              totalAEDBalance >= 0 
                ? 'text-green-600 dark:text-green-400' 
                : 'text-destructive'
            }`}>
              {formatAmount(totalAEDBalance)}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {balances.length > 0 ? (
          balances.map((balance, index) => (
            <Card key={index} className="group relative overflow-hidden transition-all duration-500 hover:shadow-2xl hover:scale-[1.08] hover:-translate-y-3 border hover:border-primary/60 bg-gradient-to-br from-background via-background to-muted/30 backdrop-blur-sm transform-gpu animate-fade-in-scale hover:shadow-primary/20 dark:hover:shadow-primary/10 hover:bg-gradient-to-br hover:from-primary/5 hover:via-background hover:to-accent/20" style={{animationDelay: `${index * 100}ms`}}>
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/15 opacity-0 group-hover:opacity-100 transition-all duration-500" />
              <div className="absolute inset-0 ring-2 ring-primary/0 group-hover:ring-primary/30 transition-all duration-500 rounded-lg" />
              <CardContent className="relative p-4 backdrop-blur-sm">
                <div className="space-y-2 pr-12">
                  {balance.cashbook_name && (
                    <p className="text-base font-medium text-foreground truncate leading-tight">
                      {balance.cashbook_name}
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-primary uppercase tracking-wide">
                      {balance.currency_code}
                    </p>
                  </div>
                  <p className={`text-2xl font-bold transition-colors duration-200 ${
                    balance.balance >= 0 
                      ? 'text-green-600 dark:text-green-400 group-hover:text-green-700 dark:group-hover:text-green-300' 
                      : 'text-red-600 dark:text-red-400 group-hover:text-red-700 dark:group-hover:text-red-300'
                  }`}>
                    {formatAmount(balance.balance)}
                  </p>
                  {balance.base_balance !== undefined && balance.currency_code !== baseCurrency && (
                    <div className="mt-2">
                      <p className="text-xs text-muted-foreground font-medium">
                        {baseCurrency} Equivalent
                      </p>
                      <p className="text-lg font-bold text-foreground">
                      {formatAmount(balance.base_balance)}
                    </p>
                    </div>
                  )}
                </div>
                <div className={`absolute bottom-3 right-3 p-1.5 rounded-lg transition-all duration-500 group-hover:scale-110 group-hover:rotate-6 shadow-md ${
                  balance.balance >= 0 
                    ? 'bg-green-500 dark:bg-green-600 group-hover:bg-green-600 dark:group-hover:bg-green-500 group-hover:shadow-green-500/50 group-hover:shadow-lg' 
                    : 'bg-red-500 dark:bg-red-600 group-hover:bg-red-600 dark:group-hover:bg-red-500 group-hover:shadow-red-500/50 group-hover:shadow-lg'
                }`}>
                  <Wallet className="w-4 h-4 text-white transition-all duration-300" />
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="col-span-4 text-center py-12">
            <div className="mx-auto w-16 h-16 bg-gray-500 dark:bg-gray-600 rounded-full flex items-center justify-center mb-4 shadow-lg">
              <Wallet className="w-8 h-8 text-white" />
            </div>
            <p className="text-muted-foreground font-medium">No cash book balances found</p>
            <p className="text-sm text-muted-foreground mt-1">Start by adding some transactions</p>
          </div>
        )}
      </div>
    </CardContent>
  </Card>
  );
});

const BankBalancesSection = memo(({ balances, baseCurrency, formatAmount }: {
  balances: any[]; 
  baseCurrency: string; 
  formatAmount: (amount: number) => string; 
}) => {
  const totalAEDBalance = balances.reduce((total, balance) => {
    return total + (balance.base_balance !== undefined ? balance.base_balance : balance.balance);
  }, 0);

  return (
    <Card className="overflow-hidden border-0 shadow-2xl transform transition-all duration-500 hover:shadow-3xl hover:-translate-y-1 bg-gradient-to-br from-background via-background to-muted/20 backdrop-blur-sm animate-fade-in-up">
      <CardHeader className="bg-gradient-to-r from-primary/15 to-primary/8 border-b border-border/50 backdrop-blur-sm relative overflow-hidden py-3 rounded-t-lg">
        <div className="flex items-center justify-between relative z-10">
          <CardTitle className="text-lg font-bold text-foreground flex items-center gap-2 drop-shadow-sm">
            <Building2 className="w-5 h-5" style={{color: '#3b82f6'}} />
            Bank Balances
          </CardTitle>
          <div className="text-right bg-background/90 backdrop-blur-sm rounded-lg p-2.5 shadow-lg border border-border/50 hover:border-primary/30 transition-all duration-300 hover:shadow-xl">
            <p className="text-xs font-medium text-muted-foreground">Total {baseCurrency} Balance</p>
            <p className={`text-xl font-bold drop-shadow-sm ${
              totalAEDBalance >= 0 
                ? 'text-green-600 dark:text-green-400' 
                : 'text-destructive'
            }`}>
              {formatAmount(totalAEDBalance)}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {balances.length > 0 ? (
          balances.map((balance, index) => (
            <Card key={index} className="group relative overflow-hidden transition-all duration-500 hover:shadow-2xl hover:scale-[1.08] hover:-translate-y-3 border hover:border-primary/60 bg-gradient-to-br from-background via-background to-muted/30 backdrop-blur-sm transform-gpu animate-fade-in-scale hover:shadow-primary/20 dark:hover:shadow-primary/10 hover:bg-gradient-to-br hover:from-primary/5 hover:via-background hover:to-accent/20" style={{animationDelay: `${index * 100}ms`}}>
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/15 opacity-0 group-hover:opacity-100 transition-all duration-500" />
              <div className="absolute inset-0 ring-2 ring-primary/0 group-hover:ring-primary/30 transition-all duration-500 rounded-lg" />
              <CardContent className="relative p-4 backdrop-blur-sm">
                <div className="space-y-2 pr-12">
                  {balance.cashbook_name && (
                    <p className="text-base font-medium text-foreground truncate leading-tight">
                      {balance.cashbook_name}
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-primary uppercase tracking-wide">
                      {balance.currency_code}
                    </p>
                  </div>
                  <p className={`text-2xl font-bold transition-colors duration-200 ${
                    balance.balance >= 0 
                      ? 'text-green-600 dark:text-green-400 group-hover:text-green-700 dark:group-hover:text-green-300' 
                      : 'text-red-600 dark:text-red-400 group-hover:text-red-700 dark:group-hover:text-red-300'
                  }`}>
                    {formatAmount(balance.balance)}
                  </p>
                  {balance.base_balance !== undefined && balance.currency_code !== baseCurrency && (
                    <div className="mt-2">
                      <p className="text-xs text-muted-foreground font-medium">
                        {baseCurrency} Equivalent
                      </p>
                      <p className="text-lg font-bold text-foreground">
                      {formatAmount(balance.base_balance)}
                    </p>
                    </div>
                  )}
                </div>
                <div className={`absolute bottom-3 right-3 p-1.5 rounded-lg transition-all duration-500 group-hover:scale-110 group-hover:rotate-6 shadow-md ${
                  balance.balance >= 0 
                    ? 'bg-blue-500 dark:bg-blue-600 group-hover:bg-blue-600 dark:group-hover:bg-blue-500 group-hover:shadow-blue-500/50 group-hover:shadow-lg' 
                    : 'bg-red-500 dark:bg-red-600 group-hover:bg-red-600 dark:group-hover:bg-red-500 group-hover:shadow-red-500/50 group-hover:shadow-lg'
                }`}>
                  <Building2 className="w-4 h-4 text-white transition-all duration-300" />
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="col-span-4 text-center py-12">
            <div className="mx-auto w-16 h-16 bg-blue-500 dark:bg-blue-600 rounded-full flex items-center justify-center mb-4 shadow-lg">
              <Building2 className="w-8 h-8 text-white" />
            </div>
            <p className="text-muted-foreground font-medium">No bank balances found</p>
            <p className="text-sm text-muted-foreground mt-1">Start by adding some bank accounts</p>
          </div>
        )}
      </div>
    </CardContent>
  </Card>
  );
});

const TopReceivablesSection = memo(({ receivables }: { receivables: any[] }) => (
  <Card className="overflow-hidden border-0 shadow-2xl transform transition-all duration-500 hover:shadow-3xl hover:-translate-y-1 bg-gradient-to-br from-background via-background to-green-50/20 dark:to-green-950/20 backdrop-blur-sm animate-fade-in-up" style={{animationDelay: '200ms'}}>
    <CardHeader className="bg-gradient-to-r from-green-100/80 to-emerald-100/80 dark:from-green-950/70 dark:to-emerald-950/70 border-b border-border/50 backdrop-blur-sm relative overflow-hidden rounded-t-lg">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer"></div>
      <CardTitle className="text-xl font-bold text-foreground flex items-center gap-2 drop-shadow-sm relative z-10">
        <div className="p-2 rounded-xl bg-green-100/50 dark:bg-green-900/30 backdrop-blur-sm shadow-inner">
          <ArrowDownToLine className="w-5 h-5 text-green-600 dark:text-green-400 drop-shadow-sm" />
        </div>
        Top Receivables
      </CardTitle>
    </CardHeader>
    <CardContent className="p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {receivables.length > 0 ? (
          receivables.slice(0, 8).map((receivable, index) => (
            <Card key={index} className="group relative overflow-hidden transition-all duration-500 hover:shadow-2xl hover:scale-[1.05] hover:-translate-y-2 border hover:border-green-500/60 bg-gradient-to-br from-background via-background to-green-50/30 dark:to-green-950/30 backdrop-blur-sm transform-gpu animate-fade-in-scale" style={{animationDelay: `${index * 100}ms`}}>
              <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 via-transparent to-emerald-500/10 opacity-0 group-hover:opacity-100 transition-all duration-500" />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-green-200/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out" />
              <CardContent className="relative p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                      <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                        {receivable.account_name.length > 12 ? receivable.account_name.substring(0, 12) + '...' : receivable.account_name}
                      </p>
                    </div>
                    <p className="text-2xl font-bold transition-colors duration-200 text-green-600 dark:text-green-400 group-hover:text-green-700 dark:group-hover:text-green-300">
                      {receivable.balance.toLocaleString()}
                    </p>
                    <div className="mt-2">
                      <p className="text-xs text-muted-foreground font-medium">
                        AED Equivalent
                      </p>
                      <p className="text-lg font-bold text-foreground">
                        {receivable.balance.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="p-2 rounded-xl transition-all duration-500 group-hover:scale-125 group-hover:rotate-3 shadow-inner backdrop-blur-sm bg-green-100 dark:bg-green-900/30 group-hover:bg-green-200 dark:group-hover:bg-green-900/50 group-hover:shadow-green-500/20 group-hover:shadow-lg">
                    <ArrowDownToLine className="w-5 h-5 transition-colors duration-500 text-green-600 dark:text-green-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="col-span-4 text-center py-12">
            <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <ArrowDownToLine className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground font-medium">No receivables found</p>
            <p className="text-sm text-muted-foreground mt-1">Start by adding some transactions</p>
          </div>
        )}
      </div>
    </CardContent>
  </Card>
));

const TopPayablesSection = memo(({ payables }: { payables: any[] }) => (
<Card className="overflow-hidden border-0 shadow-2xl transform transition-all duration-500 hover:shadow-3xl hover:-translate-y-1 bg-gradient-to-br from-background via-background to-red-50/20 dark:to-red-950/20 backdrop-blur-sm animate-fade-in-up" style={{animationDelay: '400ms'}}>
    <CardHeader className="bg-gradient-to-r from-red-100/80 to-rose-100/80 dark:from-red-950/70 dark:to-rose-950/70 border-b border-border/50 backdrop-blur-sm relative overflow-hidden rounded-t-lg">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer"></div>
      <CardTitle className="text-xl font-bold text-foreground flex items-center gap-2 drop-shadow-sm relative z-10">
        <div className="p-2 rounded-xl bg-red-100/50 dark:bg-red-900/30 backdrop-blur-sm shadow-inner">
          <ArrowUpFromLine className="w-5 h-5 text-red-600 dark:text-red-400 drop-shadow-sm" />
        </div>
        Top Payables
      </CardTitle>
    </CardHeader>
    <CardContent className="p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {payables.length > 0 ? (
          payables.slice(0, 8).map((payable, index) => (
            <Card key={index} className="group relative overflow-hidden transition-all duration-500 hover:shadow-2xl hover:scale-[1.05] hover:-translate-y-2 border hover:border-red-500/60 bg-gradient-to-br from-background via-background to-red-50/30 dark:to-red-950/30 backdrop-blur-sm transform-gpu animate-fade-in-scale" style={{animationDelay: `${index * 100}ms`}}>
              <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 via-transparent to-rose-500/10 opacity-0 group-hover:opacity-100 transition-all duration-500" />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-red-200/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out" />
              <CardContent className="relative p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                      <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                        {payable.account_name.length > 12 ? payable.account_name.substring(0, 12) + '...' : payable.account_name}
                      </p>
                    </div>
                    <p className="text-2xl font-bold transition-colors duration-200 text-red-600 dark:text-red-400 group-hover:text-red-700 dark:group-hover:text-red-300">
                      {Math.abs(payable.balance).toLocaleString()}
                    </p>
                    <div className="mt-2">
                      <p className="text-xs text-muted-foreground font-medium">
                        AED Equivalent
                      </p>
                      <p className="text-lg font-bold text-foreground">
                        {Math.abs(payable.balance).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="p-2 rounded-xl transition-all duration-500 group-hover:scale-125 group-hover:rotate-3 shadow-inner backdrop-blur-sm bg-red-100 dark:bg-red-900/30 group-hover:bg-red-200 dark:group-hover:bg-red-900/50 group-hover:shadow-red-500/20 group-hover:shadow-lg">
                    <ArrowUpFromLine className="w-5 h-5 transition-colors duration-500 text-red-600 dark:text-red-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="col-span-4 text-center py-12">
            <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <ArrowUpFromLine className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground font-medium">No payables found</p>
            <p className="text-sm text-muted-foreground mt-1">Start by adding some transactions</p>
          </div>
        )}
      </div>
    </CardContent>
  </Card>
));

const TopCommissionTransactionsSection = memo(({ transactions, baseCurrency, formatAmount }: {
  transactions: any[];
  baseCurrency: string;
  formatAmount: (amount: number) => string;
}) => (
  <Card className="border-0 shadow-2xl transform transition-all duration-500 hover:shadow-3xl hover:-translate-y-1 bg-gradient-to-br from-background via-background to-primary/5 backdrop-blur-sm">
    <CardHeader className="bg-gradient-to-r from-primary/15 to-primary/8 border-b border-border/50 backdrop-blur-sm relative overflow-hidden rounded-t-lg">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"></div>
      <CardTitle className="text-xl font-bold text-foreground flex items-center gap-2 drop-shadow-sm relative z-10">
        <div className="p-2 rounded-xl bg-primary/10 backdrop-blur-sm shadow-inner">
          <TrendingUp className="w-5 h-5 text-primary drop-shadow-sm" />
        </div>
        Top Transactions by Commission
      </CardTitle>
    </CardHeader>
    <CardContent className="p-6">
      <div className="overflow-x-hidden max-w-full pr-4">
        <table className="w-full min-w-0">
          <thead>
            <tr className="text-left border-b border-border">
              <th className="pb-3 font-semibold text-muted-foreground">Date</th>
              <th className="pb-3 font-semibold text-muted-foreground">Voucher</th>
              <th className="pb-3 font-semibold text-muted-foreground">Description</th>
              <th className="pb-3 font-semibold text-muted-foreground">Type</th>
              <th className="pb-3 font-semibold text-right text-muted-foreground">{baseCurrency} Commission</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {transactions.length > 0 ? (
              transactions.slice(0, 5).map((transaction, index) => (
                <tr key={index} className="hover:bg-gradient-to-r hover:from-muted/30 hover:to-accent/20 transition-all duration-300 hover:shadow-md hover:scale-[1.01] transform-gpu">
                  <td className="py-3 text-foreground drop-shadow-sm">{transaction.date}</td>
                  <td className="py-3 text-foreground drop-shadow-sm">{transaction.voucher_no}</td>
                  <td className="py-3 text-foreground drop-shadow-sm">{transaction.description}</td>
                  <td className="py-3">
                    <span className="px-3 py-1.5 text-xs font-medium rounded-full bg-gradient-to-r from-secondary to-secondary/80 text-secondary-foreground shadow-sm backdrop-blur-sm border border-border/30 hover:shadow-md transition-all duration-300">
                      {transaction.transaction_type}
                    </span>
                  </td>
                  <td className="py-3 text-right font-medium text-green-600 dark:text-green-400 drop-shadow-sm pr-2">
                        {formatAmount(transaction.commission)}
                      </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="py-8 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <TrendingUp className="w-8 h-8 text-muted-foreground" />
                    <p className="text-muted-foreground font-medium">No commission transactions found</p>
                    <p className="text-sm text-muted-foreground">Start by adding some transactions</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </CardContent>
  </Card>
));

// Memoized Loading Component
const LoadingSection = memo(({ title, rows = 5, columns = 2 }: {
  title: string;
  rows?: number;
  columns?: number;
}) => (
  <Card className="border-0 shadow-2xl transform transition-all duration-500 bg-gradient-to-br from-background via-background to-muted/20 backdrop-blur-sm animate-fade-in-up">
    <CardHeader className="bg-gradient-to-r from-muted/20 to-muted/10 border-b border-border/50 backdrop-blur-sm rounded-t-lg">
      <CardTitle className="text-lg font-semibold text-foreground drop-shadow-sm">{title}</CardTitle>
    </CardHeader>
    <CardContent className="space-y-3 p-6">
      {Array(rows).fill(0).map((_, i) => (
        <div key={i} className="flex justify-between items-center animate-fade-in-scale" style={{animationDelay: `${i * 100}ms`}}>
          {Array(columns).fill(0).map((_, j) => (
            <div key={j} className="animate-pulse bg-gradient-to-r from-muted via-muted/80 to-muted h-4 rounded-lg shadow-inner" 
                 style={{ width: j === 0 ? '60%' : '30%' }}></div>
          ))}
        </div>
      ))}
    </CardContent>
  </Card>
));

// Error Boundary Component
class DashboardErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Dashboard Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 text-center">
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="p-6">
              <p className="text-destructive mb-4">Something went wrong loading the dashboard.</p>
              <button 
                onClick={() => this.setState({ hasError: false })}
                className="px-4 py-2 bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 transition-colors"
              >
                Try Again
              </button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function Dashboard() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cashBookBalances, setCashBookBalances] = useState<CashBookBalance[]>([]);
  const [bankBalances, setBankBalances] = useState<CashBookBalance[]>([]);
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

  // Memoize date calculations
  const dateRange = useMemo(() => {
    // Current month dates
    const currentMonthStart = startOfMonth(selectedMonth);
    const currentMonthEnd = endOfMonth(selectedMonth);
    const startDate = format(currentMonthStart, 'yyyy-MM-dd');
    const endDate = format(currentMonthEnd, 'yyyy-MM-dd');
    
    // Previous month dates - ensure we go back exactly one month
    const previousMonthDate = subMonths(selectedMonth, 1);
    const previousMonthStart = format(startOfMonth(previousMonthDate), 'yyyy-MM-dd');
    const previousMonthEnd = format(endOfMonth(previousMonthDate), 'yyyy-MM-dd');
    
    // Verify that we have different months
     const currentMonth = selectedMonth.getMonth();
     const prevMonth = previousMonthDate.getMonth();
     const currentYear = selectedMonth.getFullYear();
     const prevYear = previousMonthDate.getFullYear();
     
     // Ensure we're actually comparing different months
     if (currentMonth === prevMonth && currentYear === prevYear) {
       console.warn('Warning: Current and previous month are the same!');
     }
    
    return {
      startDate,
      endDate,
      previousMonthStart,
      previousMonthEnd
    };
  }, [selectedMonth]);

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

        // Fetch all data in parallel with better error handling
        const results = await Promise.allSettled([
          fetchCashBookBalances(ratesMap, baseCurrencyCode, baseCurrencyIdValue),
          fetchBankBalances(ratesMap, baseCurrencyCode, baseCurrencyIdValue),
          fetchTopReceivables(),
          fetchTopPayables(),
          fetchTopCommissionTransactions(ratesMap, baseCurrencyCode, baseCurrencyIdValue),
          fetchCommissionSummary(),
          fetchTopCustomers(),
          fetchTopSuppliers(),
          fetchRecentCashTransactions(),
          fetchCommissionComparison()
        ]);

        // Log any failed requests but don't fail the entire dashboard
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            console.error(`Dashboard data fetch ${index} failed:`, result.reason);
          }
        });

      } catch (error) {
        console.error('Error fetching dashboard data:', error);
        setError('Failed to load dashboard data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, [selectedMonth, refreshKey, dateRange]);

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

            // Add cashbook name to balance data
            balance.cashbook_name = cashBook.name;

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

  const fetchBankBalances = async (
    ratesMap: Record<string, Currency>,
    baseCurrencyCode: string,
    baseCurrencyId: string
  ) => {
    try {
      // First get all bank accounts (for now, we'll use accounts with 'Bank' in the name or create a bank subcategory)
      // Since there's no is_bank field, we'll filter by account names containing 'Bank' or specific subcategories
      const { data: bankAccounts, error: bankAccountsError } = await supabase
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
        .or('name.ilike.%bank%,name.ilike.%current%,name.ilike.%saving%')
        .eq('is_active', true);

      if (bankAccountsError) throw bankAccountsError;

      if (!bankAccounts?.length) {
        setBankBalances([]);
        return;
      }

      // Get balances for each bank account
      const balances: CashBookBalance[] = [];
      
      for (const bankAccount of bankAccounts) {
        const { data: balanceData, error: balanceError } = await supabase
          .rpc('get_cash_book_doc_balance', {
            p_account_id: bankAccount.id
          });

        if (balanceError) throw balanceError;

        if (balanceData?.length) {
          // Calculate base currency equivalent if not base currency
          balanceData.forEach((balance: CashBookBalance) => {
            const isBase = bankAccount.currency.is_base;
            const rate = bankAccount.currency.rate || 1;
            const exchangeRateNote = bankAccount.currency.exchange_rate_note;

            // Add bank account name to balance data
            balance.cashbook_name = bankAccount.name;

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

      setBankBalances(balances);
    } catch (error) {
      console.error('Error fetching bank balances:', error);
      throw error;
    }
  };

  const fetchTopReceivables = useCallback(async () => {
    try {
      // Use a single optimized query with joins
      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select(`
          id,
          name,
          code,
          gl_transactions!inner(
            debit,
            credit,
            header:gl_headers!inner(
              status
            )
          ),
          subcategories!inner(
            name
          )
        `)
        .eq('subcategories.name', 'Business Partner')
        .eq('is_active', true)
        .eq('gl_transactions.header.status', 'posted');

      if (error) throw error;

      if (!data?.length) {
        setTopReceivables([]);
        return;
      }

      // Calculate balances and filter receivables
      const partners: BusinessPartner[] = [];
      
      data.forEach(account => {
        const totalBalance = account.gl_transactions.reduce((sum: number, t: any) => {
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
      });

      // Sort by balance descending and take top 10
      const topPartners = partners
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 10);

      setTopReceivables(topPartners);
    } catch (error) {
      console.error('Error fetching top receivables:', error);
      throw error;
    }
  }, [baseCurrency]);

  const fetchTopPayables = useCallback(async () => {
    try {
      // Use a single optimized query with joins
      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select(`
          id,
          name,
          code,
          gl_transactions!inner(
            debit,
            credit,
            header:gl_headers!inner(
              status
            )
          ),
          subcategories!inner(
            name
          )
        `)
        .eq('subcategories.name', 'Business Partner')
        .eq('is_active', true)
        .eq('gl_transactions.header.status', 'posted');

      if (error) throw error;

      if (!data?.length) {
        setTopPayables([]);
        return;
      }

      // Calculate balances and filter payables
      const partners: BusinessPartner[] = [];
      
      data.forEach(account => {
        const totalBalance = account.gl_transactions.reduce((sum: number, t: any) => {
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
      });

      // Sort by balance descending and take top 10
      const topPartners = partners
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 10);

      setTopPayables(topPartners);
    } catch (error) {
      console.error('Error fetching top payables:', error);
      throw error;
    }
  }, [baseCurrency]);

  const fetchTopCommissionTransactions = useCallback(async (
    ratesMap: Record<string, Currency>,
    baseCurrencyCode: string,
    baseCurrencyId: string
  ) => {
    try {
      console.log('Fetching top commission transactions for date range:', dateRange);
      
      // Get commission account ID
      const { data: commissionAccount, error: commissionError } = await supabase
        .from('chart_of_accounts')
        .select('id')
        .eq('code', '0000000005')
        .single();

      if (commissionError) {
        console.error('Error fetching commission account:', commissionError);
        throw commissionError;
      }

      console.log('Commission account found:', commissionAccount);
      const commissionAccountId = commissionAccount.id;

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
        .gte('transaction_date', dateRange.startDate)
        .lte('transaction_date', dateRange.endDate)
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
  }, [dateRange]);

  const fetchCommissionSummary = useCallback(async () => {
    try {
      console.log('Fetching commission summary for date range:', dateRange);
      
      // Get commission account ID
      const { data: commissionAccount, error: commissionError } = await supabase
        .from('chart_of_accounts')
        .select('id')
        .eq('code', '0000000005')
        .single();

      if (commissionError) {
        console.error('Error fetching commission account:', commissionError);
        throw commissionError;
      }

      console.log('Commission account found:', commissionAccount);
      const commissionAccountId = commissionAccount.id;

      // Get transaction types
      const { data: transactionTypes, error: typesError } = await supabase
        .from('tbl_trans_type')
        .select('type_id, transaction_type_code, description')
        .in('transaction_type_code', ['IPTC', 'GENT', 'MNGC', 'BNKT']);

      if (typesError) {
        console.error('Error fetching transaction types:', typesError);
        throw typesError;
      }

      console.log('Transaction types found:', transactionTypes);

      if (!transactionTypes?.length) {
        console.log('No transaction types found, setting empty commission summary');
        setCommissionSummary([]);
        return;
      }

      const summary: CommissionSummary[] = [];

      // For each transaction type, calculate total commission
      for (const type of transactionTypes) {
        console.log('Processing transaction type:', type);
        
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
          .gte('transaction_date', dateRange.startDate)
          .lte('transaction_date', dateRange.endDate);

        if (transactionsError) {
          console.error('Error fetching transactions for type', type.transaction_type_code, ':', transactionsError);
          throw transactionsError;
        }

        console.log('Transactions found for', type.transaction_type_code, ':', transactions?.length || 0);

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

        console.log('Total commission for', type.transaction_type_code, ':', totalCommission);

        // Always add the transaction type to the summary, even if commission is 0
        summary.push({
          transaction_type: type.transaction_type_code,
          description: type.description,
          total_commission: totalCommission
        });
      }

      // Sort by total commission descending
      const sortedSummary = summary.sort((a, b) => b.total_commission - a.total_commission);
      
      console.log('Final commission summary:', sortedSummary);
      setCommissionSummary(sortedSummary);
    } catch (error) {
      console.error('Error fetching commission summary:', error);
      throw error;
    }
  }, [dateRange]);

  

  const fetchTopCustomers = useCallback(async () => {
    try {
      console.log('Fetching top customers with params:', {
        input_start_date: dateRange.startDate,
        input_end_date: dateRange.endDate,
        input_subcategory_name: 'Business Partner',
        input_currency_code: 'AED'
      });
      
      const { data, error } = await supabase.rpc('fetch_top_customers', {
        input_start_date: dateRange.startDate,
        input_end_date: dateRange.endDate,
        input_subcategory_name: 'Business Partner',
        input_currency_code: 'AED'
      });
  
      if (error) {
        console.error('RPC error for top customers:', error);
        throw error;
      }
      
      console.log('Top customers data received:', data);
      setTopCustomers(data || []);
    } catch (err) {
      console.error('Error fetching top customers:', err.message);
      setTopCustomers([]);
    }
  }, [dateRange]);
      

  const fetchTopSuppliers = useCallback(async () => {
    try {
      console.log('Fetching top suppliers with params:', {
        input_start_date: dateRange.startDate,
        input_end_date: dateRange.endDate,
        input_subcategory_name: 'Business Partner',
        input_currency_code: baseCurrency
      });
      
      const { data, error } = await supabase.rpc('fetch_top_suppliers', {
        input_start_date: dateRange.startDate,
        input_end_date: dateRange.endDate,
        input_subcategory_name: 'Business Partner', // Suppliers fall under this subcategory
        input_currency_code: baseCurrency
      });
  
      if (error) {
        console.error('RPC error for top suppliers:', error);
        return;
      }
      
      console.log('Top suppliers data received:', data);
      setTopSuppliers(data || []);
    } catch (err) {
      console.error('Unexpected error in fetchTopSuppliers:', err);
    }
  }, [dateRange, baseCurrency]);
  

  const fetchRecentCashTransactions = useCallback(async () => {
    try {
      // Get CASH transaction type ID and recent transactions in a single optimized query
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
  }, [baseCurrency]);

  const fetchCommissionComparison = useCallback(async () => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] fetchCommissionComparison called with dateRange:`, dateRange);
    console.log(`[${timestamp}] Selected month:`, format(selectedMonth, 'yyyy-MM-dd'));
    try {
      // Get commission account ID
      const { data: commissionAccount, error: commissionError } = await supabase
        .from('chart_of_accounts')
        .select('id')
        .eq('code', '0000000005')
        .single();

      if (commissionError) throw commissionError;

      const commissionAccountId = commissionAccount.id;
      console.log('Commission account ID:', commissionAccountId);

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
        .gte('header.transaction_date', dateRange.startDate)
        .lte('header.transaction_date', dateRange.endDate);

      if (currentMonthError) throw currentMonthError;
      console.log('Current month data retrieved:', currentMonthData?.length || 0, 'transactions');
      console.log('Current month sample transactions:', currentMonthData?.slice(0, 3).map(t => ({ credit: t.credit, date: t.header?.transaction_date })));

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
        .gte('header.transaction_date', dateRange.previousMonthStart)
        .lte('header.transaction_date', dateRange.previousMonthEnd);

      if (previousMonthError) throw previousMonthError;
      console.log('Previous month data retrieved:', previousMonthData?.length || 0, 'transactions');
      console.log('Previous month sample transactions:', previousMonthData?.slice(0, 3).map(t => ({ credit: t.credit, date: t.header?.transaction_date })));

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
      
      // Verify data integrity - check if we have overlapping transactions
      const currentDates = currentMonthData?.map(t => t.header?.transaction_date) || [];
      const previousDates = previousMonthData?.map(t => t.header?.transaction_date) || [];
      const overlappingDates = currentDates.filter(date => previousDates.includes(date));
      
      if (overlappingDates.length > 0) {
        console.warn('Warning: Found overlapping transaction dates between current and previous month:', overlappingDates);
      }
      
      // Calculate percentage change
      let percentageChange = 0;
      if (previousMonthCommission > 0) {
        percentageChange = ((currentMonthCommission - previousMonthCommission) / previousMonthCommission) * 100;
      }
      
      // Log summary for debugging
      console.log(`[${timestamp}] Commission Comparison Summary:`, {
        currentPeriod: `${dateRange.startDate} to ${dateRange.endDate}`,
        previousPeriod: `${dateRange.previousMonthStart} to ${dateRange.previousMonthEnd}`,
        currentAmount: currentMonthCommission,
        previousAmount: previousMonthCommission,
        currentTransactions: currentMonthData?.length || 0,
        previousTransactions: previousMonthData?.length || 0,
        hasOverlap: overlappingDates.length > 0,
        percentageChange
      });

      setCommissionComparison({
        currentMonth: currentMonthCommission,
        previousMonth: previousMonthCommission,
        percentageChange
      });
    } catch (error) {
      console.error('Error fetching commission comparison:', error);
      throw error;
    }
  }, [dateRange]);

  const handleMonthChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const date = new Date(e.target.value);
    console.log('Month changed from', format(selectedMonth, 'yyyy-MM'), 'to', format(date, 'yyyy-MM'));
    setSelectedMonth(date);
  }, [selectedMonth]);

  const handleRefresh = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  // Memoize expensive calculations
  const formattedSelectedMonth = useMemo(() => {
    return format(selectedMonth, 'yyyy-MM');
  }, [selectedMonth]);

  const hasData = useMemo(() => {
    return cashBookBalances.length > 0 || 
           topReceivables.length > 0 || 
           topPayables.length > 0 || 
           topCommissionTransactions.length > 0;
  }, [cashBookBalances, topReceivables, topPayables, topCommissionTransactions]);

  if (error) {
    return (
      <div className="p-4 text-center">
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <DashboardErrorBoundary>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <div className="flex items-center gap-4">
            <div className="flex items-center">
              <input
                type="month"
                value={formattedSelectedMonth}
                onChange={handleMonthChange}
                className="px-3 py-2 border border-border rounded-lg bg-background hover:bg-accent transition-colors shadow-sm focus:ring-2 focus:ring-sidebar-ring focus:border-sidebar-ring text-gray-900 dark:!text-white [color-scheme:light] dark:[color-scheme:dark]"
              />
            </div>
            <button
              onClick={handleRefresh}
              className="p-2 text-muted-foreground hover:text-foreground rounded-full hover:bg-accent"
              title="Refresh data"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </div>
      
      {/* Cash Book Balances */}
      {isLoading ? (
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <h2 className="text-lg font-semibold text-foreground">Cash Book Balances</h2>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array(4).fill(0).map((_, i) => (
                <div key={i} className="animate-pulse bg-muted p-6 rounded-lg h-24"></div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <CashBookBalancesSection 
          balances={cashBookBalances} 
          baseCurrency={baseCurrency} 
          formatAmount={formatAmount} 
        />
      )}
      
      {/* Bank Balances Section */}
      {isLoading ? (
        <Card className="border-0 shadow-2xl transform transition-all duration-500 hover:shadow-3xl hover:-translate-y-1 bg-gradient-to-br from-background via-background to-primary/5 backdrop-blur-sm">
          <CardHeader className="bg-gradient-to-r from-primary/15 to-primary/8 border-b border-border/50 backdrop-blur-sm relative overflow-hidden rounded-t-lg">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"></div>
            <CardTitle className="text-xl font-bold text-foreground flex items-center gap-2 drop-shadow-sm relative z-10">
              <div className="p-2 rounded-xl bg-primary/10 backdrop-blur-sm shadow-inner">
                <div className="animate-pulse bg-muted w-5 h-5 rounded"></div>
              </div>
              <div className="animate-pulse bg-muted h-6 w-32 rounded"></div>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array(4).fill(0).map((_, i) => (
                <div key={i} className="animate-pulse bg-muted p-6 rounded-lg h-24"></div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <BankBalancesSection 
          balances={bankBalances} 
          baseCurrency={baseCurrency} 
          formatAmount={formatAmount} 
        />
      )}
      
      {/* Top Receivables and Payables */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Receivables */}
        <Card className="border-0 shadow-2xl transform transition-all duration-500 hover:shadow-3xl hover:-translate-y-1 bg-gradient-to-br from-background via-background to-primary/5 backdrop-blur-sm">
          <CardHeader className="bg-gradient-to-r from-primary/15 to-primary/8 border-b border-border/50 backdrop-blur-sm relative overflow-hidden rounded-t-lg">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"></div>
            <CardTitle className="text-xl font-bold text-foreground flex items-center gap-2 drop-shadow-sm relative z-10">
              <div className="p-2 rounded-xl bg-primary/10 backdrop-blur-sm shadow-inner">
                <ArrowDownToLine className="w-5 h-5 text-primary drop-shadow-sm" />
              </div>
              Top Receivables
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-hidden max-w-full">
          <table className="w-full min-w-0">
                <thead>
                  <tr className="text-left border-b border-border">
                    <th className="pb-3 font-semibold text-foreground">Business Partner</th>
                    <th className="pb-3 font-semibold text-right text-foreground">{baseCurrency}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {isLoading ? (
                    Array(5).fill(0).map((_, i) => (
                      <tr key={i}>
                        <td className="py-3">
                          <div className="animate-pulse bg-muted h-4 w-3/4 rounded"></div>
                        </td>
                        <td className="py-3 text-right">
                          <div className="animate-pulse bg-muted h-4 w-1/2 ml-auto rounded"></div>
                        </td>
                      </tr>
                    ))
                  ) : topReceivables.length > 0 ? (
                    topReceivables.map((partner, index) => (
                      <tr key={index}>
                        <td className="py-3 text-foreground">{partner.name}</td>
                        <td className="py-3 text-right text-green-600 font-medium">
                          {formatAmount(partner.balance)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={2} className="py-4 text-center text-muted-foreground">
                        No receivables found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        
        {/* Top Payables */}
        <Card className="border-0 shadow-2xl transform transition-all duration-500 hover:shadow-3xl hover:-translate-y-1 bg-gradient-to-br from-background via-background to-primary/5 backdrop-blur-sm">
          <CardHeader className="bg-gradient-to-r from-primary/15 to-primary/8 border-b border-border/50 backdrop-blur-sm relative overflow-hidden rounded-t-lg">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"></div>
            <CardTitle className="text-xl font-bold text-foreground flex items-center gap-2 drop-shadow-sm relative z-10">
              <div className="p-2 rounded-xl bg-primary/10 backdrop-blur-sm shadow-inner">
                <ArrowUpFromLine className="w-5 h-5 text-primary drop-shadow-sm" />
              </div>
              Top Payables
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-hidden max-w-full">
          <table className="w-full min-w-0">
                <thead>
                  <tr className="text-left border-b border-border">
                    <th className="pb-3 font-semibold text-foreground">Business Partner</th>
                    <th className="pb-3 font-semibold text-right text-foreground">{baseCurrency}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {isLoading ? (
                    Array(5).fill(0).map((_, i) => (
                      <tr key={i}>
                        <td className="py-3">
                          <div className="animate-pulse bg-muted h-4 w-3/4 rounded"></div>
                        </td>
                        <td className="py-3 text-right">
                          <div className="animate-pulse bg-muted h-4 w-1/2 ml-auto rounded"></div>
                        </td>
                      </tr>
                    ))
                  ) : topPayables.length > 0 ? (
                    topPayables.map((partner, index) => (
                      <tr key={index}>
                        <td className="py-3 text-foreground">{partner.name}</td>
                        <td className="py-3 text-right text-red-600 font-medium">
                          {formatAmount(partner.balance)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={2} className="py-4 text-center text-muted-foreground">
                        No payables found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Top Commission Transactions */}
      {isLoading ? (
        <Card className="border-0 shadow-2xl transform transition-all duration-500 hover:shadow-3xl hover:-translate-y-1 bg-gradient-to-br from-background via-background to-primary/5 backdrop-blur-sm">
          <CardHeader className="bg-gradient-to-r from-primary/15 to-primary/8 border-b border-border/50 backdrop-blur-sm relative overflow-hidden rounded-t-lg">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"></div>
            <CardTitle className="text-xl font-bold text-foreground flex items-center gap-2 drop-shadow-sm relative z-10">
              <div className="p-2 rounded-xl bg-primary/10 backdrop-blur-sm shadow-inner">
                <TrendingUp className="w-5 h-5 text-primary drop-shadow-sm" />
              </div>
              Top Transactions by Commission
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-hidden max-w-full">
          <table className="w-full min-w-0">
                <thead>
                  <tr className="text-left border-b border-border">
                    <th className="pb-3 font-semibold text-foreground">Date</th>
                    <th className="pb-3 font-semibold text-foreground">Voucher</th>
                    <th className="pb-3 font-semibold text-foreground">Description</th>
                    <th className="pb-3 font-semibold text-foreground">Type</th>
                    <th className="pb-3 font-semibold text-right text-foreground">{baseCurrency} Commission</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {Array(5).fill(0).map((_, i) => (
                    <tr key={i}>
                      <td className="py-3">
                        <div className="animate-pulse bg-muted h-4 w-20 rounded"></div>
                      </td>
                      <td className="py-3">
                        <div className="animate-pulse bg-muted h-4 w-24 rounded"></div>
                      </td>
                      <td className="py-3">
                        <div className="animate-pulse bg-muted h-4 w-40 rounded"></div>
                      </td>
                      <td className="py-3">
                        <div className="animate-pulse bg-muted h-4 w-16 rounded"></div>
                      </td>
                      <td className="py-3 text-right">
                        <div className="animate-pulse bg-muted h-4 w-20 ml-auto rounded"></div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <TopCommissionTransactionsSection 
          transactions={topCommissionTransactions} 
          baseCurrency={baseCurrency} 
          formatAmount={formatAmount} 
        />
      )}
      
      {/* Commission Summary and Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Category-wise Commission Summary */}
        <Card className="md:col-span-2 border-0 shadow-2xl transform transition-all duration-500 hover:shadow-3xl hover:-translate-y-1 bg-gradient-to-br from-background via-background to-primary/5 backdrop-blur-sm">
          <CardHeader className="bg-gradient-to-r from-primary/15 to-primary/8 border-b border-border/50 backdrop-blur-sm relative overflow-hidden rounded-t-lg">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"></div>
            <CardTitle className="text-xl font-bold text-foreground flex items-center gap-2 drop-shadow-sm relative z-10">
              <div className="p-2 rounded-xl bg-primary/10 backdrop-blur-sm shadow-inner">
                <TrendingUp className="w-5 h-5 text-primary drop-shadow-sm" />
              </div>
              Commission by Transaction Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-hidden max-w-full">
          <table className="w-full min-w-0">
                <thead>
                  <tr className="text-left border-b border-border">
                    <th className="pb-3 font-semibold text-foreground">Type</th>
                    <th className="pb-3 font-semibold text-foreground">Description</th>
                    <th className="pb-3 font-semibold text-right text-foreground">Commission ({baseCurrency})</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {isLoading ? (
                    Array(4).fill(0).map((_, i) => (
                      <tr key={i}>
                        <td className="py-3">
                          <div className="animate-pulse bg-muted h-4 w-16 rounded"></div>
                        </td>
                        <td className="py-3">
                          <div className="animate-pulse bg-muted h-4 w-40 rounded"></div>
                        </td>
                        <td className="py-3 text-right">
                          <div className="animate-pulse bg-muted h-4 w-20 ml-auto rounded"></div>
                        </td>
                      </tr>
                    ))
                  ) : commissionSummary.length > 0 ? (
                    commissionSummary.map((item, index) => (
                      <tr key={index}>
                        <td className="py-3 text-foreground">{item.transaction_type}</td>
                        <td className="py-3 text-foreground">{item.description}</td>
                        <td className="py-3 text-right font-medium text-green-600 pr-2">
                          {formatAmount(item.total_commission)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="py-4 text-center text-muted-foreground">
                        No commission data found
                      </td>
                    </tr>
                  )}
                  {commissionSummary.length > 0 && (
                    <tr className="font-semibold">
                      <td className="py-3 text-foreground" colSpan={2}>Total</td>
                      <td className="py-3 text-right text-green-600 pr-2">
                        {formatAmount(commissionSummary.reduce((sum, item) => sum + item.total_commission, 0))}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        
        {/* Commission Comparison */}
        <Card className="overflow-hidden border-0 shadow-2xl transform transition-all duration-500 hover:shadow-3xl hover:-translate-y-1 bg-gradient-to-br from-background via-background to-muted/20 backdrop-blur-sm">
          <CardHeader className="bg-gradient-to-r from-primary/15 to-primary/8 border-b border-border/50 backdrop-blur-sm relative overflow-hidden py-3 rounded-t-lg">
            <div className="flex items-center justify-between relative z-10">
              <CardTitle className="text-lg font-bold text-foreground flex items-center gap-2 drop-shadow-sm">
                <div className="p-1.5 rounded-lg bg-primary/10 backdrop-blur-sm shadow-inner">
                  <TrendingUp className="w-4 h-4 text-primary drop-shadow-sm" />
                </div>
                Commission Comparison
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            {isLoading ? (
              <div className="animate-pulse space-y-4">
                <div className="bg-muted h-16 rounded-lg"></div>
                <div className="bg-muted h-16 rounded-lg"></div>
                <div className="bg-muted h-16 rounded-lg"></div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                <Card className="group relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:scale-[1.01] hover:-translate-y-0.5 border hover:border-primary/30 bg-gradient-to-br from-background to-green-50/10 dark:to-green-900/10 backdrop-blur-sm">
                  <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 via-transparent to-green-500/8 opacity-0 group-hover:opacity-100 transition-all duration-300" />
                  <div className="absolute inset-0 ring-1 ring-primary/0 group-hover:ring-green-500/20 transition-all duration-300 rounded-lg" />
                  <CardContent className="relative p-4 space-y-2 backdrop-blur-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-green-500" />
                      <p className="text-sm font-medium text-green-600 uppercase tracking-wide">Current Month</p>
                    </div>
                    <p className="text-2xl font-bold text-green-700 dark:text-green-400 group-hover:text-green-800 dark:group-hover:text-green-300 transition-colors duration-200">
                      {baseCurrency} {formatAmount(commissionComparison.currentMonth)}
                    </p>
                  </CardContent>
                </Card>
                
                <Card className="group relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:scale-[1.01] hover:-translate-y-0.5 border hover:border-primary/30 bg-gradient-to-br from-background to-blue-50/10 dark:to-blue-900/10 backdrop-blur-sm">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-blue-500/8 opacity-0 group-hover:opacity-100 transition-all duration-300" />
                  <div className="absolute inset-0 ring-1 ring-primary/0 group-hover:ring-blue-500/20 transition-all duration-300 rounded-lg" />
                  <CardContent className="relative p-4 space-y-2 backdrop-blur-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-blue-500" />
                      <p className="text-sm font-medium text-blue-600 uppercase tracking-wide">Previous Month</p>
                    </div>
                    <p className="text-2xl font-bold text-blue-700 dark:text-blue-400 group-hover:text-blue-800 dark:group-hover:text-blue-300 transition-colors duration-200">
                      {baseCurrency} {formatAmount(commissionComparison.previousMonth)}
                    </p>
                  </CardContent>
                </Card>
                
                <Card className={`group relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:scale-[1.01] hover:-translate-y-0.5 border hover:border-primary/30 bg-gradient-to-br from-background backdrop-blur-sm ${
                  commissionComparison.percentageChange >= 0 
                    ? 'to-green-50/10 dark:to-green-900/10' 
                    : 'to-red-50/10 dark:to-red-900/10'
                }`}>
                  <div className={`absolute inset-0 bg-gradient-to-br via-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 ${
                    commissionComparison.percentageChange >= 0 
                      ? 'from-green-500/5 to-green-500/8' 
                      : 'from-red-500/5 to-red-500/8'
                  }`} />
                  <div className={`absolute inset-0 ring-1 ring-primary/0 group-hover:ring-opacity-20 transition-all duration-300 rounded-lg ${
                    commissionComparison.percentageChange >= 0 
                      ? 'group-hover:ring-green-500/20' 
                      : 'group-hover:ring-red-500/20'
                  }`} />
                  <CardContent className="relative p-4 space-y-2 backdrop-blur-sm">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${
                        commissionComparison.percentageChange >= 0 
                          ? 'bg-green-500' 
                          : 'bg-red-500'
                      }`} />
                      <p className={`text-sm font-medium uppercase tracking-wide ${
                        commissionComparison.percentageChange >= 0 
                          ? 'text-green-600' 
                          : 'text-red-600'
                      }`}>
                        Change
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className={`text-2xl font-bold transition-colors duration-200 ${
                        commissionComparison.percentageChange >= 0 
                          ? 'text-green-700 dark:text-green-400 group-hover:text-green-800 dark:group-hover:text-green-300' 
                          : 'text-red-700 dark:text-red-400 group-hover:text-red-800 dark:group-hover:text-red-300'
                      }`}>
                        {commissionComparison.percentageChange >= 0 ? '+' : ''}
                        {commissionComparison.percentageChange.toFixed(2)}%
                      </p>
                      {commissionComparison.percentageChange !== 0 && (
                        <TrendingUp className={`w-5 h-5 ${
                          commissionComparison.percentageChange >= 0 
                            ? 'text-green-600' 
                            : 'text-red-600'
                        }`} />
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Top Customers and Suppliers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Customers */}
        <Card className="border-0 shadow-2xl transform transition-all duration-500 hover:shadow-3xl hover:-translate-y-1 bg-gradient-to-br from-background via-background to-primary/5 backdrop-blur-sm">
          <CardHeader className="bg-gradient-to-r from-primary/15 to-primary/8 border-b border-border/50 backdrop-blur-sm relative overflow-hidden rounded-t-lg">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"></div>
            <CardTitle className="text-xl font-bold text-foreground flex items-center gap-2 drop-shadow-sm relative z-10">
              <div className="p-2 rounded-xl bg-primary/10 backdrop-blur-sm shadow-inner">
                <Users className="w-5 h-5 text-primary drop-shadow-sm" />
              </div>
              Top Customers by Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border">
              {isLoading ? (
                Array(5).fill(0).map((_, i) => (
                  <div key={i} className="animate-pulse flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-muted"></div>
                      <div>
                        <div className="h-4 w-32 bg-muted rounded"></div>
                      </div>
                    </div>
                    <div className="h-4 w-24 bg-muted rounded"></div>
                  </div>
                ))
              ) : topCustomers.length > 0 ? (
                topCustomers.map((customer, index) => (
                  <div key={index} className="flex items-center justify-between py-3 hover:bg-gradient-to-r hover:from-muted/30 hover:to-accent/20 transition-all duration-300 rounded-lg px-2 hover:shadow-md hover:scale-[1.02] transform-gpu">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900 dark:to-blue-800 flex items-center justify-center shadow-inner backdrop-blur-sm border border-blue-200/50 dark:border-blue-700/50">
                        <span className="text-blue-600 dark:text-white font-medium text-sm drop-shadow-sm">{index + 1}</span>
                      </div>
                      <div>
                        <p className="font-medium text-foreground text-sm drop-shadow-sm">{customer.name}</p>
                      </div>
                    </div>
                    <p className="font-semibold text-foreground text-sm drop-shadow-sm">
                      {formatAmount(customer.balance)}
                    </p>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-muted-foreground">
                  No customer data found
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        
        {/* Top Suppliers */}
        <Card className="border-0 shadow-2xl transform transition-all duration-500 hover:shadow-3xl hover:-translate-y-1 bg-gradient-to-br from-background via-background to-primary/5 backdrop-blur-sm">
          <CardHeader className="bg-gradient-to-r from-primary/15 to-primary/8 border-b border-border/50 backdrop-blur-sm relative overflow-hidden rounded-t-lg">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"></div>
            <CardTitle className="text-xl font-bold text-foreground flex items-center gap-2 drop-shadow-sm relative z-10">
              <div className="p-2 rounded-xl bg-primary/10 backdrop-blur-sm shadow-inner">
                <Building2 className="w-5 h-5 text-primary drop-shadow-sm" />
              </div>
              Top Suppliers by Payments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border">
              {isLoading ? (
                Array(5).fill(0).map((_, i) => (
                  <div key={i} className="animate-pulse flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-muted"></div>
                      <div>
                        <div className="h-4 w-32 bg-muted rounded"></div>
                      </div>
                    </div>
                    <div className="h-4 w-24 bg-muted rounded"></div>
                  </div>
                ))
              ) : topSuppliers.length > 0 ? (
                topSuppliers.map((supplier, index) => (
                  <div key={index} className="flex items-center justify-between py-3 hover:bg-gradient-to-r hover:from-muted/30 hover:to-accent/20 transition-all duration-300 rounded-lg px-2 hover:shadow-md hover:scale-[1.02] transform-gpu">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-100 to-purple-200 dark:from-purple-900 dark:to-purple-800 flex items-center justify-center shadow-inner backdrop-blur-sm border border-purple-200/50 dark:border-purple-700/50">
                        <span className="text-purple-600 dark:text-white font-medium text-sm drop-shadow-sm">{index + 1}</span>
                      </div>
                      <div>
                        <p className="font-medium text-foreground text-sm drop-shadow-sm">{supplier.name}</p>
                      </div>
                    </div>
                    <p className="font-semibold text-foreground text-sm drop-shadow-sm">
                      {formatAmount(supplier.balance)}
                    </p>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-muted-foreground">
                  No supplier data found
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Recent Cash Transactions */}
      <Card className="border-0 shadow-2xl transform transition-all duration-500 hover:shadow-3xl hover:-translate-y-1 bg-gradient-to-br from-background via-background to-primary/5 backdrop-blur-sm">
        <CardHeader className="bg-gradient-to-r from-primary/15 to-primary/8 border-b border-border/50 backdrop-blur-sm relative overflow-hidden rounded-t-lg">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"></div>
          <CardTitle className="text-xl font-bold text-foreground flex items-center gap-2 drop-shadow-sm relative z-10">
            <div className="p-2 rounded-xl bg-primary/10 backdrop-blur-sm shadow-inner">
              <TrendingUp className="w-5 h-5 text-primary drop-shadow-sm" />
            </div>
            Recent Cash Transactions
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-12">
          <div className="overflow-x-hidden max-w-full pb-8 pr-4">
          <table className="w-full min-w-0">
              <thead>
                <tr className="text-left border-b border-border">
                  <th className="pb-3 font-semibold text-foreground">Date</th>
                  <th className="pb-3 font-semibold text-foreground">Voucher No</th>
                  <th className="pb-3 font-semibold text-foreground">Description</th>
                  <th className="pb-3 font-semibold text-foreground">Partner</th>
                  <th className="pb-3 font-semibold text-right text-foreground">{baseCurrency}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  Array(5).fill(0).map((_, i) => (
                    <tr key={i}>
                      <td className="py-3">
                        <div className="animate-pulse bg-muted h-4 w-20 rounded"></div>
                      </td>
                      <td className="py-3">
                        <div className="animate-pulse bg-muted h-4 w-24 rounded"></div>
                      </td>
                      <td className="py-3">
                        <div className="animate-pulse bg-muted h-4 w-40 rounded"></div>
                      </td>
                      <td className="py-3">
                        <div className="animate-pulse bg-muted h-4 w-32 rounded"></div>
                      </td>
                      <td className="py-3 text-right">
                        <div className="animate-pulse bg-muted h-4 w-20 ml-auto rounded"></div>
                      </td>
                    </tr>
                  ))
                ) : recentCashTransactions.length > 0 ? (
                  recentCashTransactions.map((transaction, index) => (
                    <tr key={index}>
                      <td className="py-3 text-foreground">{transaction.date}</td>
                      <td className="py-3 text-foreground">{transaction.voucher_no}</td>
                      <td className="py-3 text-foreground">{transaction.description}</td>
                      <td className="py-3 text-foreground">{transaction.partner}</td>
                      <td className={`py-3 text-right font-medium pr-2 ${
                        transaction.amount >= 0 
                          ? 'text-green-600' 
                          : 'text-red-600'
                      }`}>
                        {formatAmount(Math.abs(transaction.amount))}
                        {transaction.amount < 0 ? ' (Cr)' : ' (Dr)'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-muted-foreground">
                      No recent cash transactions found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      </div>
    </DashboardErrorBoundary>
  );
}