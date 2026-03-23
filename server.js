const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
// Increased limit to 50mb to ensure large sync batches from dukas don't fail
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ extended: true }));

const SUPABASE_URL = 'https://lzxhbtrpsrnsistngonk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eGhidHJwc3Juc2lzdG5nb25rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUyMDI5MSwiZXhwIjoyMDg3MDk2MjkxfQ.EAGXtILYQ-dNrMxs_WeQvAxtsKeIIDqlmnOyFauAAHI';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * 🛡️ PERMANENT STABILITY MIDDLEWARE
 * This cleans data before it hits Supabase to prevent "Numeric Syntax" and "Date" errors.
 */
const cleanDataForPostgres = (data) => {
    return data.map(item => {
        const cleaned = { ...item };

        // 1. DATE STABILITY: Convert 'timestamp' or 'dd/MM/yy' to ISO
        let rawDate = cleaned.timestamp || cleaned.created_at || new Date().toISOString();
        if (typeof rawDate === 'string' && rawDate.includes('/')) {
            try {
                const [datePart, timePart] = rawDate.split(' ');
                const [d, m, y] = datePart.split('/');
                const year = y.length === 2 ? `20${y}` : y;
                cleaned.created_at = `${year}-${m}-${d}T${timePart || '00:00'}:00Z`;
            } catch (e) {
                cleaned.created_at = new Date().toISOString();
            }
        } else {
            cleaned.created_at = rawDate;
        }
        // Remove 'timestamp' to match Supabase schema perfectly
        delete cleaned.timestamp;

        // 2. NUMERIC STABILITY: Fix the "invalid input syntax for type numeric: """ error
        // PostgreSQL cannot accept "" for numbers. This converts blanks to 0.
        const numericFields = [
            'total_amount', 'amount', 'price', 'buying_price', 
            'selling_price', 'stock_level', 'quantity', 'balance', 'amount_paid'
        ];

        numericFields.forEach(field => {
            if (cleaned.hasOwnProperty(field)) {
                if (cleaned[field] === "" || cleaned[field] === null || cleaned[col] === "null") {
                    cleaned[field] = 0;
                } else {
                    cleaned[field] = parseFloat(cleaned[field]) || 0;
                }
            }
        });

        return cleaned;
    });
};

app.get('/', (req, res) => {
    res.status(200).send("🚀 SautiPesa Omni-Bridge: Stable, Permanent & Online");
});

/**
 * 🛠️ UNIVERSAL OMNI-ROUTING
 */
app.post('/:targetTable', async (req, res) => {
    const { targetTable } = req.params;
    let data = req.body;
    
    if (!Array.isArray(data)) {
        data = [data];
    }

    console.log(`📡 OMNI-SYNC: Table [${targetTable}] | Batch Size: ${data.length}`);

    try {
        const cleanedData = cleanDataForPostgres(data);

        /**
         * 🚀 THE SURE FIX:
         * Uses the unique constraint (merchant_shortcode + created_at) to prevent duplicates.
         * ignoreDuplicates: true ensures that even if a record exists, the server returns 200 OK.
         */
        const { error } = await supabase
            .from(targetTable)
            .upsert(cleanedData, { 
                onConflict: 'merchant_shortcode,created_at', 
                ignoreDuplicates: true 
            });

        if (error) {
            console.error(`❌ SQL REJECTED [${targetTable}]:`, error.message);
            return res.status(400).json({ error: error.message });
        }

        console.log(`✅ SUCCESS: Synced ${cleanedData.length} records to ${targetTable}.`);
        res.status(200).json({ status: "success", count: cleanedData.length });

    } catch (err) {
        console.error("❌ BRIDGE CRITICAL ERROR:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// Merchant Registration with Ward/Location support
app.post('/register', async (req, res) => {
    const merchantData = req.body;
    try {
        const { error } = await supabase.from('merchants').upsert([merchantData], { onConflict: 'shortcode' });
        if (error) throw error;
        console.log(`🏢 Merchant Registered: ${merchantData.business_name}`);
        res.status(200).json({ status: "success" });
    } catch (err) {
        console.error("❌ REGISTRATION ERROR:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// MPESA CALLBACK (STK PUSH)
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
            await supabase.from('mpesa_sales').insert([payload]);
            console.log("💰 M-Pesa Payment Logged Successfully.");
        }
    } catch (err) {
        console.error("❌ CALLBACK ERROR:", err.message);
    }
});

const PORT = process.env.PORT || 10000; 
app.listen(PORT, '0.0.0.0', () => { 
    console.log(`📡 SautiPesa Omni-Bridge listening on Port ${PORT}`); 
});
