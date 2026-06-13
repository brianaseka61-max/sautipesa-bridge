// register.js
const consumerKey = "0ydGXEUacH7xLMwMXBZpmOuD9I29S8zzsuWiHGeBK6nBQm8A";
const consumerSecret = "HGiwyqMhOT52C1lTd78q2khTQ2p6WW6LDmdjrHsJWlbupZNT3CKUleD8NxgumLAk";
const shortCode = "600986"; // Your exact updated app shortcode

async function registerUrls() {
    try {
        console.log("⏳ Fetching OAuth Access Token from Safaricom...");
        const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
        const tokenRes = await fetch("https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials", {
            headers: { "Authorization": `Basic ${auth}` }
        });
        
        if (!tokenRes.ok) throw new Error("Failed to authenticate credentials.");
        const tokenData = await tokenRes.json();
        const accessToken = tokenData.access_token;
        console.log("✅ Token successfully generated!");
        
        console.log(`⏳ Registering Render webhooks for Shortcode ${shortCode}...`);
        const regRes = await fetch("https://sandbox.safaricom.co.ke/mpesa/c2b/v1/registerurl", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "ShortCode": shortCode,
                "ResponseType": "Completed",
                "ConfirmationURL": "https://sautipesa-bridge.onrender.com/api/daraja/confirmation",
                "ValidationURL": "https://sautipesa-bridge.onrender.com/api/daraja/validation"
            })
        });
        
        const responseData = await regRes.json();
        console.log("🎉 Safaricom Registration Response:", responseData);
        
    } catch (error) {
        console.error("❌ Error during URL registration:", error.message);
    }
}

registerUrls();
