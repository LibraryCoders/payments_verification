const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const admin = require('firebase-admin');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Import Vercel helper
try {
    const vercelHelper = require('./helpers/vercel-config');
    if (process.env.VERCEL === '1') {
        vercelHelper.logVercelEnvironment();
    }
} catch (err) {
    console.log('Vercel helper not available:', err.message);
}

// Initialize Firebase Admin SDK
let serviceAccount;
try {
    // First try to load from environment variable if it exists
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else {
        // Fall back to file (for local development)
        serviceAccount = require('./serviceAccountKey.json');
    }
} catch (error) {
    console.error('Error loading Firebase credentials:', error);
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.firestore();

const app = express();

// Add request logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Use raw body for webhook route
app.use((req, res, next) => {
    if (req.originalUrl === '/api/payment/webhook') {
        next();
    } else {
        bodyParser.json()(req, res, next);
    }
});

app.use(cors({ origin: process.env.FRONTEND_URL }));

// Debug endpoint to check environment variables (EXCLUDE SENSITIVE KEYS)
app.get('/debug', (req, res) => {
    res.json({
        environment: process.env.NODE_ENV,
        vercel: {
            is_vercel: !!process.env.VERCEL,
            env: process.env.VERCEL_ENV,
            region: process.env.VERCEL_REGION,
            url: process.env.VERCEL_URL
        },
        frontend_url: process.env.FRONTEND_URL,
        firebase_setup: !!admin.apps.length,
        stripe_setup: !!stripe,
        port: process.env.PORT || 3001,
        routes: [
            { method: 'GET', path: '/health' },
            { method: 'GET', path: '/debug' },
            { method: 'POST', path: '/api/payment/create-intent' },
            { method: 'GET', path: '/api/payment/:paymentIntentId' },
            { method: 'POST', path: '/api/payment/refund' },
            { method: 'POST', path: '/api/payment/webhook' }
        ]
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).send('Server is running');
});

// Catch-all route for undefined routes
app.use('*', (req, res) => {
    console.log(`Route not found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ error: `Cannot ${req.method} ${req.originalUrl}` });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(`Error processing ${req.method} ${req.url}:`, err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: err.message,
        path: req.path
    });
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

// Error handling for unhandled promises
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Only start the server if this file is run directly (not imported via require)
if (require.main === module) {
    // Start the server
    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
        console.log(`CORS allowed origin: ${process.env.FRONTEND_URL}`);
        console.log(`Firebase initialized: ${!!admin.apps.length}`);
        console.log(`Stripe initialized: ${!!stripe}`);
    });
}

// Export the app for serverless environments like Vercel
module.exports = app;