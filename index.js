const Flutterwave = require('flutterwave-node-v3');
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const fetch = require('node-fetch');
const axios = require('axios');
const app = express()
dotenv.config();
app.use(cors());
app.use(express.json());
const sgMail = require('@sendgrid/mail');
const Mailgun = require('mailgun.js');
const bodyParser = require('body-parser');
const formData = require('form-data');
const twilio = require('twilio');
const { Vonage } = require('@vonage/server-sdk');
const Stripe = require('stripe');

//////////////////////////// FLUTTERWAVE ///////////////////////////////////////////////////
app.post('/', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    const secretKey = req.headers['x-secret-key'];
    if (!apiKey || !secretKey) {
        return res.status(400).json({ error: 'Flutterwave API key and secret key are required' });
    }
    const flw = new Flutterwave(apiKey, secretKey);
    try {
        const response = await flw.Charge.card(req.body)
        console.log(response)
        res.json(response);
        // Authorizing transactions
        // For PIN transactions
        if (response.meta.authorization.mode === 'pin') {
            let payload2 = req.body
            payload2.authorization = {
                "mode": "pin",
                "fields": [
                    "pin"
                ],
                "pin": res.body.pin
            }

            console.log(response);
        }
    } catch (error) {
        console.log(error)
    }
});

app.post('/otp', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    const secretKey = req.headers['x-secret-key'];
    if (!apiKey || !secretKey) {
        return res.status(400).json({ error: 'Flutterwave API key and secret key are required' });
    }
    const flw = new Flutterwave(apiKey, secretKey);
    try {
        const callValidate = await flw.Charge.validate(req.body)
        res.json(callValidate);
        console.log(callValidate);
    }
    catch (error) {
        console.log(error)
    }
});

app.post('/verify-transaction', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    const secretKey = req.headers['x-secret-key'];
    if (!apiKey || !secretKey) {
        return res.status(400).json({ error: 'Flutterwave API key and secret key are required' });
    }
    const flw = new Flutterwave(apiKey, secretKey);
    try {
        const transaction = await flw.Transaction.verify(req.body);
        res.json(transaction);
        console.log(transaction);
    }
    catch (error) {
        console.log(error)
    }
});

app.post('/verify-transaction-queue', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    const secretKey = req.headers['x-secret-key'];
    if (!apiKey || !secretKey) {
        return res.status(400).json({ error: 'Flutterwave API key and secret key are required' });
    }

    const flw = new Flutterwave(apiKey, secretKey);
    try {
        const transaction = transactionVerificationQueue.add(req.body);
        console.log(transaction);
        return res.redirect('/payment-processing');
    }
    catch (error) {
        console.log(error)
    }
});

app.post('/token', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    const secretKey = req.headers['x-secret-key'];
    if (!apiKey || !secretKey) {
        return res.status(400).json({ error: 'Flutterwave API key and secret key are required' });
    }
    const flw = new Flutterwave(apiKey, secretKey);
    try {
        const token = await flw.Tokenized.charge(req.body);
        res.json(token);
        console.log(token);
    }
    catch (error) {
        console.log(error)
    }
});

///////////////////////// STRIPE //////////////////////////////////////////
app.post('/create-payment-intent', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    const secretKey = req.headers['x-secret-key'];
    console.log(apiKey);
    const {
        email,
        items,
        currency,
        request_three_d_secure,
        payment_method_types = [],
        client = 'ios',
    } = req.body;
    const stripe = new Stripe(apiKey, {
        apiVersion: '2023-08-16',
        typescript: true,
    });
    try {
        const customer = await stripe.customers.create({ email });
        const params = {
            amount: req.body.amount * 100,
            currency: req.body.currency,
            customer: customer.id,
            payment_method_options: {
                card: {
                    request_three_d_secure: request_three_d_secure || 'automatic',
                },
                sofort: {
                    preferred_language: 'en',
                },
                wechat_pay: {
                    app_id: 'wx65907d6307c3827d',
                    client: client,
                },
            },
            payment_method_types: payment_method_types,
        };
        const paymentIntent = await stripe.paymentIntents.create(params);

        // Send publishable key and PaymentIntent client_secret to client.
        return res.send({
            clientSecret: paymentIntent.client_secret,
        });
    } catch (error) {
        return res.send({
            error: error.raw.message,
        });
    }
});

app.post('/payment-sheet', async (_, res) => {
    const apiKey = _.headers['x-api-key'];
    const secretKey = _.headers['x-secret-key'];
    const stripe = new Stripe(apiKey, {
        apiVersion: '2023-08-16',
        typescript: true,
    });
    const customers = await stripe.customers.list();
    // Here, we're getting latest customer only for example purposes.
    const customer = customers.data[0];
    if (!customer) {
        return res.send({
            error: 'You have no customer created',
        });
    }
    const ephemeralKey = await stripe.ephemeralKeys.create(
        { customer: customer.id },
        { apiVersion: '2023-08-16' }
    );
    console.log(`Response is ${_.body.amount}`);
    const paymentIntent = await stripe.paymentIntents.create({
        amount: _.body.amount * 100,
        currency: 'eur',
        customer: customer.id,
        // Edit the following to support different payment methods in your PaymentSheet
        // Note: some payment methods have different requirements: https://stripe.com/docs/payments/payment-methods/integration-options
        payment_method_types: [
            'card',
            // 'ideal',
            // 'sepa_debit',
            // 'sofort',
            // 'bancontact',
            // 'p24',
            // 'giropay',
            // 'eps',
            // 'afterpay_clearpay',
            // 'klarna',
            // 'us_bank_account',
        ],
    });
    return res.json({
        paymentIntent: paymentIntent.client_secret,
        ephemeralKey: ephemeralKey.secret,
        customer: customer.id,
    });
});


//////////////////////////// SENDGRID //////////////////////////////
app.post('/sendgrid-bulk-email', async (req, res) => {
    const { apiKey, to, subject, text, html, from } = req.body;
    console.log(apiKey);
    if (!apiKey) {
        return res.status(400).json({ error: 'SendGrid API key is required' });
    }
    sgMail.setApiKey(apiKey);
    const msg = {
        to: to, // Array of email addresses
        from: from, // Your verified sender
        subject: subject,
        text: text,
        html: html,
    };
    try {
        await sgMail.sendMultiple(msg);
        console.log(req.body);
        res.status(200).json({ message: 'Emails sent successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to send emails' });
    }
});


//////////////////////////////// MAILGUN ////////////////////////
app.post('/mailgun-bulk-email', (req, res) => {
    try {
        const { to, subject, text, apiKey, domain, from, html } = req.body;
        const mailgun = new Mailgun(formData);
        console.log('Recipients:', to);

        // Validate required fields
        if (!apiKey || !domain) {
            return res.status(400).json({ error: 'Mailgun API key and domain are required' });
        }
        if (!Array.isArray(to) || to.length === 0) {
            return res.status(400).json({ error: 'Recipients should be a non-empty array' });
        }
        if (!from) {
            return res.status(400).json({ error: '"from" email address is required' });
        }

        // Initialize Mailgun client
        const mg = mailgun.client({
            key: apiKey,
            username: 'api'
        });

        // Email data
        const data = {
            from: from,
            to: to,  // Send as an array directly
            subject: subject || 'No Subject',  // Provide a default subject if not supplied
            text: text || '',  // Fallback to empty string if text is not provided
            html: html || ''   // Fallback to empty string if HTML content is not provided
        };

        console.log('Email data to be sent:', data);  // Log the email data for debugging purposes

        // Send the email using the promise-based method
        mg.messages.create(domain, data)
            .then((msg) => {
                console.log('Email sent successfully:', msg);  // Log success message
                res.status(200).json({ message: 'Emails sent successfully', msg });
            })
            .catch((err) => {
                console.error('Error sending emails:', err);  // Log error
                res.status(500).json({ error: err.message || 'An error occurred while sending emails' });
            });

    } catch (err) {
        // Catch any unexpected errors
        console.error('Unexpected error:', err);
        res.status(500).json({ error: 'An unexpected error occurred' });
    }
});

///////////////////// TWILIO //////////////////////

// POST route to send WhatsApp messages
app.post('/send-bulk-twilio-whatsapp', async (req, res) => {
    const { message, recipients, accountSid, authToken, from } = req.body; // Get message and recipient numbers from request body

    if (!message || !recipients || !recipients.length) {
        return res.status(400).json({ error: 'Message and recipients are required' });
    }

    const whatsappFrom = 'whatsapp:+YOUR_TWILIO_WHATSAPP_NUMBER';
    const client = new twilio(accountSid, authToken);
    try {
        // Send message to each recipient
        const sendMessages = recipients.map((recipient) => {
            return client.messages.create({
                body: message,
                from: from,
                to: `whatsapp:${recipient}`
            });
        });

        // Wait for all messages to be sent
        await Promise.all(sendMessages);

        res.status(200).json({ success: true, message: 'Messages sent successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/send-bulk-twilio-sms', async (req, res) => {
    const { message, recipients, twilioNumber, accountSid, authToken } = req.body;

    if (!message || !recipients || !recipients.length) {
        return res.status(400).json({ error: 'Message and recipients are required' });
    }

    const client = new twilio(accountSid, authToken);

    const sendSMS = recipients.map(number => {
        return client.messages.create({
            body: message,
            from: twilioNumber, // Replace with your Twilio phone number
            to: number
        });
    });

    try {
        await Promise.all(sendSMS);
        res.status(200).json({ success: true, message: 'Bulk SMS sent successfully!' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to send bulk SMS', error });
    }
});
//////////////////////// NEXMO ////////////////////////////////////

app.post('/send-bulk-nexmo-whatsapp', async (req, res) => {
    const { message, recipients, apiKey, apiSecret, vonageNumber } = req.body; // Extract message and recipients from the request body

    if (!message || !recipients || !recipients.length) {
        return res.status(400).json({ error: 'Message and recipients are required' });
    }

    try {
        const sendMessages = recipients.map((recipient) => {
            return axios.post('https://api.nexmo.com/v1/messages', {
                from: { type: 'whatsapp', number: vonageNumber },
                to: { type: 'whatsapp', number: recipient },
                message: {
                    content: {
                        type: 'text',
                        text: message
                    }
                }
            }, {
                auth: {
                    username: apiKey,
                    password: apiSecret
                }
            });
        });

        // Wait for all messages to be sent
        await Promise.all(sendMessages);

        res.status(200).json({ success: true, message: 'Messages sent successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post('/send-bulk-nexmo-sms', async (req, res) => {
    const { message, numbers, apiKey, apiSecret, from } = req.body;

    if (!message || !numbers || numbers.length === 0) {
        return res.status(400).json({ error: 'Message and numbers are required' });
    }
    const vonage = new Vonage({
        apiKey: apiKey,     // Replace with your Nexmo API Key
        apiSecret: apiSecret // Replace with your Nexmo API Secret
    });

    const sendSMS = numbers.map(number => {
        return new Promise((resolve, reject) => {
            vonage.sms.send(
                {
                    from: from, // Replace with your Nexmo virtual number
                    to: number,
                    text: message
                },
                (err, responseData) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(responseData);
                    }
                }
            );
        });
    });

    try {
        await Promise.all(sendSMS);
        res.status(200).json({ success: true, message: 'Bulk SMS sent successfully!' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to send bulk SMS', error });
    }
});

////////////////////// TELESIGN ///////////////////////////

app.post('/send-bulk-telesign-whatsapp', async (req, res) => {
    const { message, recipients, apiKey, fromNumber, customerId } = req.body; // Get message and recipient numbers from request body

    if (!message || !recipients || !recipients.length) {
        return res.status(400).json({ error: 'Message and recipients are required' });
    }

    const apiUrl = `https://rest-api.telesign.com/v1/messaging`;

    try {
        const sendMessages = recipients.map(async (recipient) => {
            const data = {
                phone_number: recipient,
                message: message,
                message_type: "ARN", // Use ARN for transactional messages
                sender_id: fromNumber
            };

            const authHeader = `Basic ${Buffer.from(`${customerId}:${apiKey}`).toString('base64')}`;

            return axios.post(apiUrl, data, {
                headers: {
                    Authorization: authHeader,
                    'Content-Type': 'application/json'
                }
            });
        });

        // Wait for all messages to be sent
        await Promise.all(sendMessages);

        res.status(200).json({ success: true, message: 'Messages sent successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// Telesign API endpoint
const smsEndpoint = `https://rest-api.telesign.com/v1/messaging`;

// Function to send SMS using Telesign
const sendTelesignSMS = async (phoneNumber, message, customerId, apiKey) => {
    const authHeader = Buffer.from(`${customerId}:${apiKey}`).toString('base64');
    try {
        const response = await axios.post(
            smsEndpoint,
            {
                phone_number: phoneNumber,
                message: message,
                message_type: "ARN" // Can be "ARN" (alerts) or "OTP"
            },
            {
                headers: {
                    'Authorization': `Basic ${authHeader}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data;
    } catch (error) {
        throw error.response ? error.response.data : error;
    }
};

// Route to send bulk SMS
app.post('/send-bulk-telesign-sms', async (req, res) => {
    const { message, numbers, apiKey, customerId } = req.body;

    if (!message || !numbers || numbers.length === 0) {
        return res.status(400).json({ error: 'Message and numbers are required' });
    }

    const sendSMS = numbers.map(number => {
        return sendTelesignSMS(number, message, customerId, apiKey);
    });

    try {
        await Promise.all(sendSMS);
        res.status(200).json({ success: true, message: 'Bulk SMS sent successfully!' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to send bulk SMS', error });
    }
});

app.listen(process.env.Port, () => {
    console.log(`Example app listening on port ${process.env.Port}`);
    // console.log(process.env.FLW_PUBLIC_KEY);

})