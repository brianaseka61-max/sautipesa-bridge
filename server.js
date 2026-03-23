const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ extended: true }));

const SUPABASE_URL = 'https://lzxhbtrpsrnsistngonk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eGhidHJwc3Juc2lzdG5nb25rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUyMDI5MSwiZXhwIjoyMDg3MDk2MjkxfQ.EAGXtILYQ-dNrMxs_WeQvAxtsKeIIDqlmnOyFauAAHI';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * 🛠️ STABILITY PROTOCOL
 * Cleans data format to match PostgreSQL strict types without losing data integrity.
 */
const prepareDataForSQL = (data) => {
    return data.map(item => {
        const cleaned = { ...item };

        // Ensure Date/Timestamp is ISO format (Supabase requirement)
        let rawDate = cleaned.timestamp || cleaned.created_at;
        if (rawDate && rawDate.includes('/')) {
            try {
                const [datePart, timePart] = rawDate.split(' ');
                const [d, m, y] = datePart.split('/');
                const year = y.length === 2 ? `20${y}` : y;
                cleaned.created_at = `${year}-${m}-${d}T${timePart || '00:00'}:00Z`;
            } catch (e) {
                cleaned.created_at = new Date().toISOString();
            }
        } else {
            cleaned.created_at = rawDate || new Date().toISOString();
        }

        // Stability: PostgreSQL Numeric columns cannot accept empty strings ""
        // This converts empty strings to 0 for money/quantity fields to prevent "Invalid Syntax" errors
        const numericFields = ['total_amount', 'amount', 'price', 'quantity', 'balance', 'stock_level'];
        numericFields.forEach(field => {
            if (cleaned[field] === "" || cleaned[field] === null) {
                cleaned[field] = 0;
            }
        });

        return cleaned;
    });
};

app.get('/', (req, res) => {
    res.status(200).send("🚀 SautiPesa Omni-Bridge: Stable & Online");
});

app.post('/:targetTable', async (req, res) => {
    const { targetTable } = req.params;
    let data = req.body;
    if (!Array.isArray(data)) data = [data];

    console.log(`📡 Sync Request: ${targetTable} | Count: ${data.length}`);

    try {
        const cleanedData = prepareDataForSQL(data);

        // Perform Upsert with 'ignoreDuplicates' to prevent the "Duplicate Key" red errors
        const { error } = await supabase
            .from(targetTable)
            .upsert(cleanedData, { 
                onConflict: 'merchant_shortcode,created_at', 
                ignoreDuplicates: true 
            });

        if (error) {
            console.error(`❌ SQL Error in ${targetTable}:`, error.message);
            return res.status(400).json({ error: error.message });
        }

        console.log(`✅ Success: Synced to ${targetTable}`);
        res.status(200).json({ status: "success" });

    } catch (err) {
        console.error("❌ Critical System Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// Merchant Registration
app.post('/register', async (req, res) => {
    try {
        const { error } = await supabase.from('merchants').upsert([req.body], { onConflict: 'shortcode' });
        if (error) throw error;
        res.status(200).json({ status: "success" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`📡 Bridge Active on Port ${PORT}`));
