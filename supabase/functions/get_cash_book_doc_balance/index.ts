import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      db: {
        schema: 'public'
      }
    }
  )

  const { p_account_id } = await req.json()

  try {
    // Query transactions for the account with document currency values
    const { data: transactions, error } = await supabaseClient
      .from('gl_transactions')
      .select('debit_doc_currency, credit_doc_currency, currency_id, currency:currencies(code)')
      .eq('account_id', p_account_id)

    if (error) throw error

    // Calculate balance by currency using document currency values
    const balances = transactions.reduce((acc, transaction) => {
      const currencyId = transaction.currency_id
      const existingBalance = acc.find(b => b.currency_id === currencyId)
      
      const amount = (transaction.debit_doc_currency || 0) - (transaction.credit_doc_currency || 0)
      
      if (existingBalance) {
        existingBalance.balance += amount
      } else {
        acc.push({
          balance: amount,
          currency_id: currencyId,
          currency_code: transaction.currency?.code || ''
        })
      }
      
      return acc
    }, [])

    // Return response in format expected by RPC call
    return new Response(
      JSON.stringify({
        data: balances,
        error: null
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
