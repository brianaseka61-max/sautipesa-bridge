const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json({ limit: '50mb' }));

// Supabase Connection
const supabase = createClient(
    'https://lzxhbtrpsrnsistngonk.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eGhidHJwc3Juc2lzdG5nb25rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUyMDI5MSwiZXhwIjoyMDg3MDk2MjkxfQ.EAGXtILYQ-dNrMxs_WeQvAxtsKeIIDqlmnOyFauAAHI'
);

/**
 * FIXES DATE FORMAT: Converts '26/03/22' or '26/3/22' to '2022-03-26'
 * This prevents the "date/time field value out of range" error in Supabase.
 */
function fixDateFormat(dateStr) {
    if (!dateStr || typeof dateStr !== 'string' || !dateStr.includes('/')) {
        return new Date().toISOString();
    }
    
    try {
        // Split date and time if both exist (e.g., "22/03/26 03:39")
        const datePart = dateStr.split(' ')[0];
        const parts = datePart.split('/'); 
        
        if (parts.length === 3) {
            // Assuming Android format is DD/MM/YY
            const day = parts[0].padStart(2, '0');
            const month = parts[1].padStart(2, '0');
            let year = parts[2];
            
            // Convert '26' to '2026'
            if (year.length === 2) year = `20${year}`;
            
            return `${year}-${month}-${day}T00:00:00Z`;
        }
    } catch (e) {
        console.error("⚠️ Date Parsing Error:", e.message);
    }
    return new Date().toISOString();
}

app.post('/:table', async (req, res) => {
    const table = req.params.table.toLowerCase();
    let data = Array.isArray(req.body) ? req.body : [req.body];

    console.log(`--- Incoming Sync Request for: ${table} ---`);

    const cleanRows = data.map(row => {
        const r = {};
        Object.keys(row).forEach(key => {
            const lowerKey = key.toLowerCase();
            
            // 1. Skip local SQLite keys that Supabase doesn't need
            if (['_id', 'id', 'is_synced'].includes(lowerKey)) return;

            // 2. Format Dates properly
            if (lowerKey === 'timestamp' || lowerKey === 'date' || lowerKey === 'created_at') {
                r[lowerKey] = fixDateFormat(row[key]);
            } else {
                // 3. Handle Empty Strings/Nulls properly
                const value = row[key];
                r[lowerKey] = (value === "" || value === "null" || value === null) ? null : value;
            }
        });

        // Ensure every record has a timestamp
        if (!r.timestamp) r.timestamp = new Date().toISOString();
        return r;
    });

    try {
        const { error } = await supabase.from(table).insert(cleanRows);
        
        if (error) {
            console.error(`❌ DB Error [${table}]:`, error.message);
            console.error(`Payload attempted:`, JSON.stringify(cleanRows[0]).substring(0, 200));
            return res.status(400).json({ error: error.message });
        }
        
        console.log(`✅ Success: Synced ${cleanRows.length} rows to ${table}`);
        res.status(200).json({ status: "success" });
    } catch (err) {
        console.error(`🔥 Server Crash on ${table}:`, err.message);
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log('-------------------------------------------');
    console.log(`🚀 Sauti Pesa Bridge LIVE on Port ${PORT}`);
    console.log('-------------------------------------------');
});
