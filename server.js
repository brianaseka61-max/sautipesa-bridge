const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json({ limit: '50mb' }));

const SUPABASE_URL = 'https://lzxhbtrpsrnsistngonk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eGhidHJwc3Juc2lzdG5nb25rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUyMDI5MSwiZXhwIjoyMDg3MDk2MjkxfQ.EAGXtILYQ-dNrMxs_WeQvAxtsKeIIDqlmnOyFauAAHI';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const cleanForSQL = (data) => {
    return data.map(item => {
        const cleaned = { ...item };
        
        // 🛠️ DYNAMIC ALIASING: Force 'created_at' and remove 'timestamp'
        const rawDate = cleaned.created_at || cleaned.timestamp || new Date().toISOString();
        cleaned.created_at = rawDate;
        delete cleaned.timestamp;

        // 🛠️ NUMERIC CLEANING: Convert any blank values to 0
        Object.keys(cleaned).forEach(key => {
            const val = cleaned[key];
            if (val === "" || val === null || val === "null") {
                // If it's a known numeric field, force 0. Otherwise, empty string.
                if (/amount|price|balance|quantity|stock|total/.test(key)) {
                    cleaned[key] = 0;
                } else {
                    cleaned[key] = "";
                }
            }
        });

        return cleaned;
    });
};

app.post('/:targetTable', async (req, res) => {
    const { targetTable } = req.params;
    let data = Array.isArray(req.body) ? req.body : [req.body];

    try {
        const cleanedData = cleanForSQL(data);
        
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

        console.log(`✅ SYNCED: ${targetTable}`);
        res.status(200).json({ status: "success" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`📡 Sauti Bridge Live`));
