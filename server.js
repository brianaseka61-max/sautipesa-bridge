const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json({ limit: '50mb' }));

// 1. DIRECT CREDENTIALS (No variables to fail)
const supabase = createClient(
    'https://lzxhbtrpsrnsistngonk.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eGhidHJwc3Juc2lzdG5nb25rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUyMDI5MSwiZXhwIjoyMDg3MDk2MjkxfQ.EAGXtILYQ-dNrMxs_WeQvAxtsKeIIDqlmnOyFauAAHI'
);

// Middleware to log EVERY request that hits the server
app.use((req, res, next) => {
    console.log(`--- NEW REQUEST: ${req.method} ${req.url} ---`);
    next();
});

// 2. UNIVERSAL SYNC ROUTE
app.post('/:table', async (req, res) => {
    const tableName = req.params.table;
    console.log(`Target Table: ${tableName}`);
    console.log(`Data Received: ${JSON.stringify(req.body).substring(0, 100)}...`);

    let rows = Array.isArray(req.body) ? req.body : [req.body];

    // Clean data for Supabase
    const cleanRows = rows.map(row => {
        const r = {};
        Object.keys(row).forEach(key => {
            if (!['_id', 'id', 'is_synced'].includes(key)) {
                r[key] = (row[key] === "" || row[key] === "null") ? null : row[key];
            }
        });
        if (!r.timestamp) r.timestamp = new Date().toISOString();
        return r;
    });

    try {
        console.log(`Attempting Supabase Insert to ${tableName}...`);
        const { error } = await supabase.from(tableName).insert(cleanRows);

        if (error) {
            console.error(`❌ SUPABASE ERROR: ${error.message}`);
            return res.status(400).json({ status: "error", message: error.message });
        }

        console.log(`✅ SUCCESS: Synced ${cleanRows.length} rows to ${tableName}`);
        res.status(200).json({ status: "success" });
    } catch (err) {
        console.error(`❌ SERVER CRASH: ${err.message}`);
        res.status(500).json({ status: "crash", error: err.message });
    }
});

// 3. SPECIAL REGISTRATION ROUTE (Backwards compatibility)
app.post('/register', async (req, res) => {
    console.log("Registering Merchant identity...");
    try {
        const { error } = await supabase.from('merchants').upsert(req.body, { onConflict: 'shortcode' });
        if (error) throw error;
        res.status(200).json({ status: "success" });
    } catch (err) {
        console.error(`❌ REG ERROR: ${err.message}`);
        res.status(400).send(err.message);
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SAUTI PESA BRIDGE IS MONITORING PORT ${PORT}`);
});
