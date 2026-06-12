// register.js
const consumerKey = "0ydGXEUacH7xLMwMXBZpmOuD9I29S8zzsuWiHGeBK6nBQm8A";
const consumerSecret = "HGiwyqMhOT52C1lTd78q2khTQ2p6WW6LDmdjrHsJWlbupZNT3CKUleD8NxgumLAk";
const shortCode = "600980"; 

async function registerUrls() {
    // 1. Get Token
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    const tokenRes = await fetch("https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials", {
        headers: { "Authorization": `Basic ${auth}` }
    });
    const tokenData = await tokenRes.json();
    
    // 2. Register URL
    const regRes = await fetch("https://sandbox.safaricom.co.ke/mpesa/c2b/v1/registerurl", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${tokenData.access_token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            "ShortCode": shortCode,
            "ResponseType": "Completed",
            "ConfirmationURL": "https://sautipesa-bridge.onrender.com/api/daraja/confirmation",
            "ValidationURL": "https://sautipesa-bridge.onrender.com/api/daraja/validation"
        })
    });
    
    console.log(await regRes.json());
}

registerUrls();
