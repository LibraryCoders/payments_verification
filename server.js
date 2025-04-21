const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const admin = require('firebase-admin');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Initialize Firebase Admin SDK
const serviceAccount = {
    "type": "service_account",
    "project_id": "originbythesea",
    "private_key_id": "e0aa078c0175003d602a159f662aff8865abafe4",
    "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCYQURRs/pDsBvG\nh+qgBupC8naA1QtpAg8OtbXNpekJzNtgORqZhrpEaN7bySP4Oqmqs61dgTFr5V+4\nATIC9YW6rqTjTWDX/b7QL6P4QxeAZa6LXwUA82SZAZdwd/mLkGPIYqrnZT5fgrl0\nV59C2EwxBDKw7HdWH8Rn4pM1+75iCdGNARbTShXGm8UzZm2bJ4nWV89JWILZ/rnd\nXG+Ee6k5175ft1namsETQJG0fbo/KgtDPie3PeZJOBiwqtiDMEuaf+I9ndL0gpRi\nIpinFvi1eKENOi712PpDyjAzUWB3p02XMT8vwWSSQRD55sIilkgEcgT3yKMx4SQC\nEkjAFcXNAgMBAAECggEAAXxVjdSLQyDTTI8j93bJz2htRpmNmHM4MWUNhpmxWfKh\nS2GTRF8/rw406oEedDwiTrOdI/XwRQTCd9mvIr9BlE5C9qLZKJJly8NDPtdswch8\nOQju1BEL8MBGuYa6LSX2C00HLOXcg3MTmzKFr9HLgIjxc6+DBJifwoG//P1dYLiC\n9BdaetdbJLqLCWbPgrE9EK3vJJC9txaeWn9JPSKwfGfMZzPJN85CcInvB0gPxIln\npgZdW2xS1mJL2EOyFgotmQA8RYHDcNJ06WK4mSGsynlWbTo+0WQloz210ndH/Mg3\nTmJX/mGLpf4t4K9qingjEzHwktK8kN6VdszoYYSkQQKBgQDF6/0RyUj7MzvL08/z\nCiUBs6JDOfJU5KE37h9Cm6NPLGryG4cBTv5cYG/xs+4VwVwFv3V6X3VyEPxyYTce\n5kcSjiLou5EDAbt/JRYZC/I3/+wsHO5TRHSs7iDNY9beRi2Rb1u40EuPl0SlszBF\nlIzRX4etaIukrWTXPn2A5LkUrQKBgQDE7sDwWFTGeeFeeXgXFmocFX/GtMZXqMWc\ntYm9p2w3/OX4Ga4TdGbaeJ7CV8sRvMjxhvsp7NPCMpM6AF/E7XfhG6RSR8phoMEv\nUmmT4X1Av+fEkyeclsj4HODN0tb/3bqM4Osw0O7qLn7FzRmscCR3gxVEo7rv3RhJ\nztdcM9J5oQKBgBsoq9xh84rM1/q7QQDHtpZKMQzqia9OhDTpjw6TztARd0drsZXj\nYhIJBbN0Dkqb8uWzBQrayIHzhMCpSGgMD1qjeHTZMCfqd/EVhLfBJOa8TosrGSUB\n8sS8FHI6rgRoOt6HGl387zFv/3KBaTFTFhOw+Sw5eVgKlxjWMWCbgi4tAoGALCLW\nWwdw+IqYV/QhVgtP/LtUx9P8H+lTYKvPExJSzrl/UPtwaCvOYWhnLGdAu9jzsC3w\nXJUXYI61MGqlDB2soGbxjP9J/Fdq9JAj2WDQEZLw/r18QzwIDpNqTrbSOMYY6Tn/\nfBFXemSxROOSvXLkuWRHf/qyCtAigWg6HBABPAECgYATBkkMHTk+b31cGchLrsxe\nAPA4rYydZD36nir4OKwSJWVlK/iyLlUZr8W4TaIZX+0WeyskQ1MT0DVLcYmXHEr6\nSfBTeoCi6uEQoSMEOjgAf8vUr0X7xpoYnUBgdLOUMe6uopkYt3A5VjHVhbEi5kda\nYlhcPpCi1vO9RVstDpVOSQ==\n-----END PRIVATE KEY-----\n",
    "client_email": "firebase-adminsdk-fbsvc@originbythesea.iam.gserviceaccount.com",
    "client_id": "116242915255432462606",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40originbythesea.iam.gserviceaccount.com",
    "universe_domain": "googleapis.com"
};

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.firestore();

const app = express();

// Use raw body for webhook route
app.use((req, res, next) => {
    if (req.originalUrl === '/api/payment/webhook') {
        next();
    } else {
        bodyParser.json()(req, res, next);
    }
});

app.use(cors({ origin: process.env.FRONTEND_URL }));

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).send('Server is running');
});

// Create payment intent endpoint
app.post('/api/payment/create-intent', async(req, res) => {
    try {
        // Extract order data from request
        const { amount, currency, metadata, shipping, userId, cartItems } = req.body;

        if (!amount || !userId) {
            return res.status(400).json({ error: 'Missing required parameters: amount and userId' });
        }

        // Create a temporary order document in Firestore
        const orderRef = db.collection('orders').doc();
        const orderId = orderRef.id;

        // Add orderId to metadata
        const enhancedMetadata = {
            ...metadata,
            orderId,
            userId
        };

        // Create a PaymentIntent with the order amount and currency
        const paymentIntent = await stripe.paymentIntents.create({
            amount,
            currency: currency || 'usd',
            metadata: enhancedMetadata,
            shipping,
            automatic_payment_methods: {
                enabled: true,
            },
        });

        // Save pending order in Firestore with payment intent ID
        await orderRef.set({
            userId,
            items: cartItems || [],
            totalAmount: amount,
            currency: currency || 'usd',
            status: 'pending',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            paymentIntentId: paymentIntent.id,
            shipping: shipping || null,
            metadata: enhancedMetadata,
        });

        // Send client secret to client-side
        res.json({
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
            orderId
        });
    } catch (error) {
        console.error('Error creating payment intent:', error);
        res.status(500).json({ error: error.message });
    }
});

// Confirm payment status endpoint
app.get('/api/payment/:paymentIntentId', async(req, res) => {
    try {
        const { paymentIntentId } = req.params;

        if (!paymentIntentId) {
            return res.status(400).json({ error: 'Payment intent ID is required' });
        }

        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        res.json({
            id: paymentIntent.id,
            amount: paymentIntent.amount,
            status: paymentIntent.status,
            created: paymentIntent.created,
            metadata: paymentIntent.metadata
        });
    } catch (error) {
        console.error('Error retrieving payment intent:', error);
        res.status(500).json({ error: error.message });
    }
});

// Process refunds endpoint
app.post('/api/payment/refund', async(req, res) => {
    try {
        const { paymentIntentId, amount, reason } = req.body;

        if (!paymentIntentId) {
            return res.status(400).json({ error: 'Payment intent ID is required' });
        }

        // Get the payment intent to find the charge ID
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        if (!paymentIntent.latest_charge) {
            return res.status(400).json({ error: 'No charge found for this payment' });
        }

        // Process the refund
        const refund = await stripe.refunds.create({
            charge: paymentIntent.latest_charge,
            amount: amount || undefined, // If amount is not provided, refund the full amount
            reason: reason || 'requested_by_customer'
        });

        // Update the order in Firestore
        if (paymentIntent.metadata.orderId) {
            const orderRef = db.collection('orders').doc(paymentIntent.metadata.orderId);
            const orderSnapshot = await orderRef.get();

            if (orderSnapshot.exists) {
                await orderRef.update({
                    status: amount ? 'partially_refunded' : 'refunded',
                    refundId: refund.id,
                    refundAmount: amount || paymentIntent.amount,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }
        }

        res.json({
            success: true,
            refundId: refund.id,
            status: refund.status
        });
    } catch (error) {
        console.error('Error processing refund:', error);
        res.status(500).json({ error: error.message });
    }
});

// Webhook handler endpoint
app.post('/api/payment/webhook', express.raw({ type: 'application/json' }), async(req, res) => {
    const sig = req.headers['stripe-signature'];

    let event;

    try {
        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
        // Handle the event
        switch (event.type) {
            case 'payment_intent.succeeded':
                const paymentIntent = event.data.object;
                await updateOrderStatus(paymentIntent.metadata.orderId, 'paid', paymentIntent);
                break;

            case 'payment_intent.payment_failed':
                const failedPayment = event.data.object;
                await updateOrderStatus(failedPayment.metadata.orderId, 'payment_failed', failedPayment);
                break;

            case 'charge.refunded':
                const refund = event.data.object;
                await handleRefund(refund);
                break;

            default:
                console.log(`Unhandled event type ${event.type}`);
        }

        // Return a 200 response to acknowledge receipt of the event
        res.send({ received: true });
    } catch (error) {
        console.error(`Error processing webhook ${event.type}:`, error);
        res.status(500).send({ error: 'Webhook processing failed' });
    }
});

// Function to update order status in Firebase
async function updateOrderStatus(orderId, status, paymentData) {
    if (!orderId) {
        console.warn('No orderId provided in metadata, skipping order update');
        return;
    }

    try {
        const orderRef = db.collection('orders').doc(orderId);
        const orderSnapshot = await orderRef.get();

        if (!orderSnapshot.exists) {
            console.warn(`Order ${orderId} not found in database`);
            return;
        }

        // Update order status
        await orderRef.update({
            status,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            paymentData: paymentData || null
        });

        // If payment succeeded, create a new payment record
        if (status === 'paid') {
            await db.collection('payments').add({
                orderId,
                paymentIntentId: paymentData.id,
                amount: paymentData.amount,
                currency: paymentData.currency,
                status: 'succeeded',
                paymentMethod: paymentData.payment_method_types[0],
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                metadata: paymentData.metadata
            });

            // Clear cart for the user if userId is provided
            if (paymentData.metadata.userId) {
                const userId = paymentData.metadata.userId;

                // Check if we should clear the cart from Firebase
                const userCartRef = db.collection('users').doc(userId).collection('cart');
                const cartItems = await userCartRef.get();

                // Delete cart items in a batch
                const batch = db.batch();
                cartItems.forEach(doc => {
                    batch.delete(doc.ref);
                });

                await batch.commit();
                console.log(`Cleared cart for user ${userId}`);
            }
        }

        console.log(`Updated order ${orderId} to status ${status}`);
    } catch (error) {
        console.error(`Error updating order ${orderId}:`, error);
        throw error;
    }
}

// Function to handle refund events
async function handleRefund(refundData) {
    try {
        // Find the order using the charge ID
        const chargeId = refundData.id;
        const orderQuery = await db.collection('orders')
            .where('paymentData.latest_charge', '==', chargeId)
            .limit(1)
            .get();

        if (orderQuery.empty) {
            console.warn(`No order found for charge ${chargeId}`);
            return;
        }

        const orderDoc = orderQuery.docs[0];
        const orderId = orderDoc.id;

        // Determine if it's a full or partial refund
        const refundStatus = refundData.amount_refunded === refundData.amount ? 'refunded' : 'partially_refunded';

        // Update the order
        await orderDoc.ref.update({
            status: refundStatus,
            refundAmount: refundData.amount_refunded,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Create a refund record
        await db.collection('refunds').add({
            orderId,
            chargeId,
            amount: refundData.amount_refunded,
            currency: refundData.currency,
            reason: refundData.reason || null,
            status: refundData.status,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`Processed refund for order ${orderId}`);
    } catch (error) {
        console.error('Error handling refund:', error);
        throw error;
    }
}

// Start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Error handling for unhandled promises
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});