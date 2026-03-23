const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const app = express();
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ extended: true }));

const SUPABASE_URL = 'https://lzxhbtrpsrnsistngonk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eGhidHJwc3Juc2lzdG5nb25rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUyMDI5MSwiZXhwIjoyMDg3MDk2MjkxfQ.EAGXtILYQ-dNrMxs_WeQvAxtsKeIIDqlmnOyFauAAHI';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

/**
 * 🛠️ DATA CLEANING & DATE CORRECTION MIDDLEWARE
 * Fixes "invalid input syntax for type numeric" and "null created_at"
 */
app.use((req, res, next) => {
    if (req.body && Array.isArray(req.body)) {
        req.body = req.body.map(item => {
            // 1. Fix Date: Ensure created_at is never null and is ISO format
            if (!item.created_at || item.created_at === "") {
                item.created_at = new Date().toISOString();
            } else if (item.created_at.includes('/')) {
                const [datePart, timePart] = item.created_at.split(' ');
                const [d, m, y] = datePart.split('/');
                const year = y.length === 2 ? `20${y}` : y;
                item.created_at = `${year}-${m}-${d}T${timePart || '00:00'}:00Z`;
            }

            // 2. Fix Numeric Syntax: Ensure amount fields are actual numbers, not strings
            const numericFields = ['amount', 'total_amount', 'price', 'quantity', 'balance'];
            numericFields.forEach(field => {
                if (item[field] !== undefined) {
                    item[field] = parseFloat(item[field]) || 0;
                }
            });

            // 3. Table Column Mapping: Align Android names with Supabase names
            if (item.total_amount && !item.amount) item.amount = item.total_amount;
            
            return item;
        });
    }
    next();
});

app.get('/', (req, res) => {
    res.status(200).send("🚀 SautiPesa Omni-Bridge: Monitoring All Business Activities!");
});

app.post('/:targetTable', async (req, res) => {
    const { targetTable } = req.params;
    let data = req.body;
    
    if (!Array.isArray(data)) {
        data = [data];
    }

    console.log(`📡 OMNI-SYNC: [${targetTable}] | Records: ${data.length}`);

    try {
        let supabaseTable = targetTable;

        switch (targetTable) {
            case 'mpesa_transactions': supabaseTable = 'mpesa_sales'; break;
            case 'sales_history': supabaseTable = 'sales_history'; break;
            case 'products': supabaseTable = 'products'; break;
            case 'debts': supabaseTable = 'debts'; break;
            case 'debt_history': supabaseTable = 'debt_payments'; break;
            case 'expenses': supabaseTable = 'expenses'; break;
            case 'appointments': supabaseTable = 'appointments'; break;
            case 'crm_leads': supabaseTable = 'crm_leads'; break;
            default: supabaseTable = targetTable;
        }

        const { error } = await supabase
            .from(supabaseTable)
            .upsert(data, { 
                onConflict: data[0].id ? 'id' : 'created_at,merchant_shortcode', 
                ignoreDuplicates: false 
            });

        if (error) {
            console.error(`❌ SUPABASE ERROR [${supabaseTable}]:`, error.message);
            return res.status(500).json({ error: error.message });
        }

        console.log(`✅ SUCCESS: Synced ${data.length} to ${supabaseTable}.`);
        res.status(200).json({ status: "success", count: data.length });

    } catch (err) {
        console.error("❌ BRIDGE ERROR:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/register', async (req, res) => {
    const merchantData = req.body;
    try {
        const { error } = await supabase.from('merchants').upsert([merchantData], { onConflict: 'shortcode' });
        if (error) throw error;
        res.status(200).json({ status: "success" });
    } catch (err) {
        console.error("❌ REGISTRATION ERROR:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/callback', async (req, res) => {
    res.status(200).send("Success"); 
    try {
        const stkCallback = req.body?.Body?.stkCallback;
        if (stkCallback?.ResultCode === 0) {
            const metadata = stkCallback.CallbackMetadata.Item;
            const payload = {
                receipt_number: String(metadata.find(i => i.Name === 'MpesaReceiptNumber')?.Value),
                amount: parseFloat(metadata.find(i => i.Name === 'Amount')?.Value),
                phone_number: String(metadata.find(i => i.Name === 'PhoneNumber')?.Value),
                transaction_date: new Date().toISOString(),
                merchant_shortcode: req.query.shortcode || "174379" 
            };
            await supabase.from('transactions').insert([payload]);
        }
    } catch (err) {}
});

const PORT = process.env.PORT || 10000; 
app.listen(PORT, '0.0.0.0', () => { 
    console.log(`📡 SautiPesa Omni-Bridge listening on Port ${PORT}`); 
});
