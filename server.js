const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json({ limit: '50mb' }));

// YOUR PERMANENT CREDENTIALS
const SUPABASE_URL = 'https://lzxhbtrpsrnsistngonk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eGhidHJwc3Juc2lzdG5nb25rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUyMDI5MSwiZXhwIjoyMDg3MDk2MjkxfQ.EAGXtILYQ-dNrMxs_WeQvAxtsKeIIDqlmnOyFauAAHI';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 1. ONBOARDING & REGISTRATION
app.post('/register', async (req, res) => {
    console.log("Registering Merchant...");
    try {
        const { error } = await supabase.from('merchants').upsert(req.body, { onConflict: 'shortcode' });
        if (error) throw error;
        res.status(200).json({ status: "success" });
    } catch (err) {
        console.error("Reg Error:", err.message);
        res.status(400).send(err.message);
    }
});

// 2. THE UNIVERSAL SYNC (Fixes the 'insert' undefined error)
app.post('/:table', async (req, res) => {
    const tableName = req.params.table;
    console.log(`Incoming sync for table: ${tableName}`);
    
    let rows = Array.isArray(req.body) ? req.body : [req.body];

    // Clean the data: Remove Android-specific local IDs
    const cleanRows = rows.map(row => {
        const { _id, id, is_synced, ...rest } = row;
        // Ensure timestamp is ISO format for Supabase
        if (!rest.timestamp) rest.timestamp = new Date().toISOString();
        return rest;
    });

    try {
        // We call supabase.from(tableName) directly. 
        // This ensures 'insert' is called on a valid Supabase object.
        const { data, error } = await supabase
            .from(tableName)
            .insert(cleanRows);

        if (error) {
            console.error(`❌ Supabase Rejected ${tableName}:`, error.message);
            return res.status(400).json({ error: error.message });
        }

        console.log(`✅ Successfully synced ${cleanRows.length} rows to ${tableName}`);
        res.status(200).json({ status: "success" });
    } catch (err) {
        console.error(`❌ Server Crash on ${tableName}:`, err.message);
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sauti Pesa Bridge is LIVE on port ${PORT}`);
});
