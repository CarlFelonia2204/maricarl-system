const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']); // Bypasses your ISP's DNS block

// ... the rest of your code
require('dotenv').config(); // THIS IS NEW
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
app.get('/', (req, res) => {

  res.send('Maricarl Resort Backend is Live and Running!');
});
app.use(express.json());
app.use(cors());

// ==========================================
// 1. GLOBAL EMAIL & SERVER CONFIGURATION
// ==========================================
const MY_GMAIL = process.env.MY_GMAIL;        // Pulls from .env
const MY_APP_PASS = process.env.MY_APP_PASS;  // Pulls from .env
const ADMIN_EMAIL = 'feloniacarl34@gmail.com';// Your receiving admin email

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: MY_GMAIL, pass: MY_APP_PASS }
});

app.use('/public', express.static('public'));

// --- HELPER: FORMAT DATES & TIMES BEAUTIFULLY ---
const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};
const formatTime = (timeStr) => {
    if (!timeStr) return '';
    let [hours, minutes] = timeStr.split(':');
    hours = parseInt(hours);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${ampm}`;
};

// --- PREMIUM HTML WRAPPER ---
const generateHTML = (title, content) => {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Outfit:wght@300;400;700&display=swap" rel="stylesheet">
    </head>
    <body style="margin: 0; padding: 20px; background-color: #F8FAFC;">
        <div style="font-family: 'Outfit', 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #141414; max-width: 600px; margin: 0 auto; background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 40px -10px rgba(15, 23, 42, 0.05);">
            <div style="background-color: #141414; padding: 40px 20px; text-align: center;">
                <h1 style="color: #C5A059; margin: 0; font-family: 'Cinzel', 'Georgia', serif; font-size: 28px; letter-spacing: 5px; text-transform: uppercase; font-weight: bold;">Maricarl Resort</h1>
                <p style="color: #94A3B8; margin-top: 8px; font-size: 13px; font-weight: 300; letter-spacing: 2px;">Your Private Sanctuary</p>
            </div>
            <div style="padding: 40px; border-bottom: 1px solid #E2E8F0;">
                <h2 style="margin-top: 0; color: #141414; font-family: 'Cinzel', serif; font-size: 22px; padding-bottom: 15px; font-weight: bold;">${title}</h2>
                <div style="font-size: 15px; line-height: 1.7; color: #475569; font-weight: 400;">
                    ${content}
                </div>
            </div>
            <div style="background-color: #F8FAFC; padding: 25px 20px; text-align: center; color: #94A3B8; font-size: 12px; font-weight: bold; border-top: 1px solid #E2E8F0; letter-spacing: 1px; text-transform: uppercase;">
                &copy; ${new Date().getFullYear()} Maricarl Resort. All rights reserved.<br>
                TIBAGAN, SAN MIGUEL, BULACAN, PHILIPPINES
            </div>
        </div>
    </body>
    </html>
    `;
};

// --- 2. DATABASE CONNECTION ---
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Cloud Database Connected Successfully!'))
  .catch(err => console.log('❌ Database Error: ', err));

// --- 3. SCHEMAS ---
const bookingSchema = new mongoose.Schema({
    guestName: String, email: String, phone: String, stayType: String,
    checkIn: String, checkOut: String, 
    checkInTime: String, checkOutTime: String, paymentMode: String,
    paymentStatus: { type: String, default: 'Pending Payment' },
    pax: Number, totalCost: Number, promoCode: String, 
    status: { type: String, default: 'Pending' }, 
    thankYouSent: { type: Boolean, default: false }, 
    reminderSent: { type: Boolean, default: false }, // NEW: Tracks if Payment Reminder was sent
    createdAt: { type: Date, default: Date.now }
});
const Booking = mongoose.model('Booking', bookingSchema);

const promoSchema = new mongoose.Schema({
    code: { type: String, uppercase: true }, discount: Number, description: String,
    expiryDate: String, usageCount: { type: Number, default: 0 }, active: { type: Boolean, default: true }
});
const Promo = mongoose.model('Promo', promoSchema);

// --- 4. BACKGROUND TASK: AUTOMATED REMINDERS & THANK YOU EMAILS ---
setInterval(async () => {
    try {
        const now = new Date();
        // Look for bookings where EITHER the thank you OR the reminder hasn't been sent
        const pastBookings = await Booking.find({ 
            status: 'Confirmed', 
            $or: [{ thankYouSent: false }, { reminderSent: false }] 
        });
        
        for (let b of pastBookings) {
            const checkOutDateStr = b.stayType === 'day' ? b.checkIn : b.checkOut;
            const timeStr = b.checkOutTime || '12:00'; 
            if (!checkOutDateStr) continue;
            
            const [year, month, day] = checkOutDateStr.split('-');
            const [hours, minutes] = timeStr.split(':');
            const checkoutDate = new Date(year, month - 1, day, hours, minutes);
            
            // If the checkout time has arrived or passed
            if (now >= checkoutDate) {
                // If PAID -> Send Thank You
                if (b.paymentStatus === 'Paid' && !b.thankYouSent) {
                    const thankYouContent = `
                        <p>Dear <strong>${b.guestName}</strong>,</p>
                        <p>Thank you for choosing Maricarl Resort for your recent stay. We hope you had a wonderful and relaxing time in our private sanctuary.</p>
                        <p>We are always striving to improve our guest experience, and your feedback means the world to us. If you have a moment, we would love to hear about your stay!</p>
                        <div style="text-align: center; margin: 40px 0;">
                            <a href="https://share.google/IUlnx9GGUKHDU4lbE" target="_blank" style="background-color: #C5A059; color: #FFFFFF; padding: 14px 28px; text-decoration: none; font-weight: bold; border-radius: 8px; text-transform: uppercase; font-size: 14px; letter-spacing: 1px;">Leave a Review</a>
                        </div>
                        <p>We hope to welcome you back again soon.</p>
                        <p>Warm regards,<br><strong>The Maricarl Resort Team</strong></p>
                    `;
                    await transporter.sendMail({
                        from: `"Maricarl Resort" <${MY_GMAIL}>`,
                        to: b.email,
                        subject: `Thank You for Staying at Maricarl Resort!`,
                        html: generateHTML('We Hope You Enjoyed Your Stay', thankYouContent)
                    });
                    
                    b.thankYouSent = true;
                    await b.save();
                    console.log(`🌟 Automated 'Thank You' email sent to: ${b.guestName}`);
                } 
                // If NOT PAID -> Send Reminder
                else if (b.paymentStatus !== 'Paid' && !b.reminderSent) {
                    const reminderContent = `
                        <p>Dear <strong>${b.guestName}</strong>,</p>
                        <p>We hope you enjoyed your time at Maricarl Resort! As your check-out time has arrived, this is a gentle reminder to settle your pending balance of <strong style="color: #E11D48;">₱${b.totalCost.toLocaleString('en-PH')}</strong>.</p>
                        <p>Please proceed to our staff or complete your GCash transfer so we can officially mark your reservation as paid.</p>
                        <p>Thank you!</p>
                    `;
                    await transporter.sendMail({
                        from: `"Maricarl Resort" <${MY_GMAIL}>`,
                        to: b.email,
                        subject: `Payment Reminder - Maricarl Resort`,
                        html: generateHTML('Pending Balance Reminder', reminderContent)
                    });
                    
                    b.reminderSent = true;
                    await b.save();
                    console.log(`⚠️ Automated 'Payment Reminder' email sent to: ${b.guestName}`);
                }
            }
        }
    } catch(e) { console.error("Automated Email error:", e.message); }
}, 60000); 

// --- 5. API ROUTES - BOOKINGS ---

app.get('/api/bookings/unavailable', async (req, res) => {
    try {
        const booked = await Booking.find({ status: { $in: ['Confirmed', 'Pending'] } });
        let disabledDates = [];
        booked.forEach(b => {
            if(!b.checkIn) return;
            let current = new Date(b.checkIn);
            let end = b.stayType === 'day' ? new Date(b.checkIn) : new Date(b.checkOut);
            while (current <= end) {
                disabledDates.push(current.toISOString().split('T')[0]);
                current.setDate(current.getDate() + 1);
            }
        });
        res.status(200).json([...new Set(disabledDates)]);
    } catch (error) { res.status(500).json([]); }
});

// ADMIN MARK AS PAID ENDPOINT (Sends Receipt + Immediately sends Thank You if checkout passed)
app.patch('/api/bookings/:id/pay', async (req, res) => {
    try {
        const booking = await Booking.findByIdAndUpdate(req.params.id, { paymentStatus: 'Paid' }, { new: true });
        if (!booking) return res.status(404).json({ error: 'Booking not found' });
        
        const formattedCheckIn = formatDate(booking.checkIn);
        const formattedCheckOut = formatDate(booking.checkOut);
        const stayDates = booking.stayType === 'day' ? formattedCheckIn : `${formattedCheckIn} to ${formattedCheckOut}`;
        
        // 1. ALWAYS SEND THE RECEIPT IMMEDIATELY
        const receiptContent = `
            <p>Dear <strong>${booking.guestName}</strong>,</p>
            <p>This email is to confirm that we have successfully received your payment of <strong style="color: #059669;">₱${booking.totalCost.toLocaleString('en-PH')}</strong>.</p>
            <h3 style="color: #141414; margin-top: 35px; font-size: 15px; text-transform: uppercase; letter-spacing: 2px; font-family: 'Cinzel', serif; font-weight: bold;">Payment Details</h3>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
                <tr style="border-bottom: 1px solid #E2E8F0;"><td style="padding: 12px 0; color: #64748B; font-weight: bold;">Dates:</td><td style="padding: 12px 0; text-align: right; font-weight: bold; color: #141414;">${stayDates}</td></tr>
                <tr style="border-bottom: 1px solid #E2E8F0;"><td style="padding: 12px 0; color: #64748B; font-weight: bold;">Mode of Payment:</td><td style="padding: 12px 0; text-align: right; font-weight: bold; color: #141414;">${booking.paymentMode}</td></tr>
                <tr style="border-bottom: 1px solid #E2E8F0;"><td style="padding: 12px 0; color: #64748B; font-weight: bold;">Amount Paid:</td><td style="padding: 12px 0; text-align: right; font-weight: bold; color: #141414;">₱${booking.totalCost.toLocaleString('en-PH')}</td></tr>
                <tr style="border-bottom: 1px solid #E2E8F0;"><td style="padding: 12px 0; color: #64748B; font-weight: bold;">Status:</td><td style="padding: 12px 0; text-align: right; font-weight: bold; color: #059669;">PAID</td></tr>
            </table>
            <p style="margin-top: 35px; text-align: center;">Thank you!</p>
        `;

        await transporter.sendMail({
            from: `"Maricarl Resort" <${MY_GMAIL}>`,
            to: booking.email,
            subject: `Payment Confirmed - Maricarl Resort`,
            html: generateHTML('Payment Received', receiptContent)
        });

        // 2. CHECK IF CHECK-OUT HAS ALREADY PASSED. IF YES, FIRE THANK YOU EMAIL NOW.
        const checkOutDateStr = booking.stayType === 'day' ? booking.checkIn : booking.checkOut;
        const timeStr = booking.checkOutTime || '12:00'; 
        
        if (checkOutDateStr && !booking.thankYouSent) {
            const [year, month, day] = checkOutDateStr.split('-');
            const [hours, minutes] = timeStr.split(':');
            const checkoutDate = new Date(year, month - 1, day, hours, minutes);
            
            if (new Date() >= checkoutDate) {
                const thankYouContent = `
                    <p>Dear <strong>${booking.guestName}</strong>,</p>
                    <p>Thank you for choosing Maricarl Resort for your recent stay. We hope you had a wonderful and relaxing time in our private sanctuary.</p>
                    <p>We are always striving to improve our guest experience, and your feedback means the world to us. If you have a moment, we would love to hear about your stay!</p>
                    <div style="text-align: center; margin: 40px 0;">
                        <a href="https://share.google/IUlnx9GGUKHDU4lbE" target="_blank" style="background-color: #C5A059; color: #FFFFFF; padding: 14px 28px; text-decoration: none; font-weight: bold; border-radius: 8px; text-transform: uppercase; font-size: 14px; letter-spacing: 1px;">Leave a Review</a>
                    </div>
                    <p>We hope to welcome you back again soon.</p>
                    <p>Warm regards,<br><strong>The Maricarl Resort Team</strong></p>
                `;
                
                await transporter.sendMail({
                    from: `"Maricarl Resort" <${MY_GMAIL}>`,
                    to: booking.email,
                    subject: `Thank You for Staying at Maricarl Resort!`,
                    html: generateHTML('We Hope You Enjoyed Your Stay', thankYouContent)
                });
                
                booking.thankYouSent = true;
                await booking.save();
                console.log(`🌟 Mark Paid Triggered: 'Thank You' email sent to: ${booking.guestName}`);
            }
        }

        res.status(200).json(booking);
    } catch(e) { res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/bookings', async (req, res) => {
    try {
        const newBooking = new Booking(req.body);
        await newBooking.save();
        
        let promoDiscount = 0;
        if(req.body.promoCode && req.body.promoCode !== 'None') {
            const p = await Promo.findOneAndUpdate({ code: req.body.promoCode }, { $inc: { usageCount: 1 } });
            if(p) promoDiscount = p.discount;
        }

        const formattedCheckIn = formatDate(newBooking.checkIn);
        const formattedCheckOut = formatDate(newBooking.checkOut);
        const stayDates = newBooking.stayType === 'day' ? formattedCheckIn : `${formattedCheckIn} to ${formattedCheckOut}`;
        const stayTimes = `${formatTime(newBooking.checkInTime)} - ${formatTime(newBooking.checkOutTime)}`;
        const originalPrice = newBooking.totalCost + promoDiscount; 
        
        let promoRow = '';
        if (promoDiscount > 0) {
            promoRow = `
            <tr style="border-bottom: 1px solid #E2E8F0;">
                <td style="padding: 10px 0; color: #64748B;">Promo Applied (${newBooking.promoCode}):</td>
                <td style="padding: 10px 0; text-align: right; font-weight: bold; color: #059669;">-₱${promoDiscount.toLocaleString('en-PH')}</td>
            </tr>`;
        }

        const adminContent = `
            <p>Hello Admin,</p>
            <p>A new reservation request has been submitted and requires your review.</p>
            
            <h3 style="color: #141414; margin-top: 35px; font-size: 15px; text-transform: uppercase; letter-spacing: 2px; font-family: 'Cinzel', serif; font-weight: bold;">Guest Information</h3>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
                <tr style="border-bottom: 1px solid #E2E8F0;"><td style="padding: 12px 0; color: #64748B; font-weight: bold;">Name:</td><td style="padding: 12px 0; text-align: right; font-weight: bold; color: #141414;">${newBooking.guestName}</td></tr>
                <tr style="border-bottom: 1px solid #E2E8F0;"><td style="padding: 12px 0; color: #64748B; font-weight: bold;">Email:</td><td style="padding: 12px 0; text-align: right; font-weight: bold; color: #141414;">${newBooking.email}</td></tr>
                <tr style="border-bottom: 1px solid #E2E8F0;"><td style="padding: 12px 0; color: #64748B; font-weight: bold;">Phone:</td><td style="padding: 12px 0; text-align: right; font-weight: bold; color: #141414;">${newBooking.phone}</td></tr>
                <tr style="border-bottom: 1px solid #E2E8F0;"><td style="padding: 12px 0; color: #64748B; font-weight: bold;">Stay Type:</td><td style="padding: 12px 0; text-align: right; font-weight: bold; color: #141414;">${newBooking.stayType === 'day' ? 'Whole Day Tour' : 'Overnight Stay'}</td></tr>
                <tr style="border-bottom: 1px solid #E2E8F0;"><td style="padding: 12px 0; color: #64748B; font-weight: bold;">Dates:</td><td style="padding: 12px 0; text-align: right; font-weight: bold; color: #141414;">${stayDates}</td></tr>
                <tr style="border-bottom: 1px solid #E2E8F0;"><td style="padding: 12px 0; color: #64748B; font-weight: bold;">Time:</td><td style="padding: 12px 0; text-align: right; font-weight: bold; color: #141414;">${stayTimes}</td></tr>
                <tr style="border-bottom: 1px solid #E2E8F0;"><td style="padding: 12px 0; color: #64748B; font-weight: bold;">Guests:</td><td style="padding: 12px 0; text-align: right; font-weight: bold; color: #141414;">${newBooking.pax} Pax</td></tr>
                <tr style="border-bottom: 1px solid #E2E8F0;"><td style="padding: 12px 0; color: #64748B; font-weight: bold;">Payment Mode:</td><td style="padding: 12px 0; text-align: right; font-weight: bold; color: #141414;">${newBooking.paymentMode}</td></tr>
            </table>

            <h3 style="color: #141414; margin-top: 35px; font-size: 15px; text-transform: uppercase; letter-spacing: 2px; font-family: 'Cinzel', serif; font-weight: bold;">Payment Summary</h3>
            <table style="width: 100%; border-collapse: collapse; background-color: #F8FAFC; border-radius: 8px; overflow: hidden; border: 1px solid #E2E8F0;">
                <tr style="border-bottom: 1px solid #E2E8F0;"><td style="padding: 15px; color: #64748B;">Base Rate:</td><td style="padding: 15px; text-align: right; font-weight: bold; color: #141414;">₱${originalPrice.toLocaleString('en-PH')}</td></tr>
                ${promoRow}
                <tr style="background-color: #141414; color: #FFF;"><td style="padding: 15px;"><strong>Final Total:</strong></td><td style="padding: 15px; text-align: right; font-size: 18px; color: #C5A059;"><strong>₱${newBooking.totalCost.toLocaleString('en-PH')}</strong></td></tr>
            </table>
            
            <p style="margin-top: 30px; text-align: center; color: #64748B;">Log in to the Admin OS to approve or reject this booking.</p>
        `;

        try {
            await transporter.sendMail({
                from: `"Maricarl Resort" <${MY_GMAIL}>`, 
                to: ADMIN_EMAIL, 
                subject: `New Reservation Request: ${newBooking.guestName}`,
                html: generateHTML('Action Required: New Booking', adminContent)
            });
        } catch(e) { console.log("Email error:", e.message); }

        res.status(201).json(newBooking);
    } catch (error) { res.status(500).json({ error: 'Failed to create booking' }); }
});

app.get('/api/bookings', async (req, res) => {
    try {
        const bookings = await Booking.find().sort({ createdAt: -1 }); 
        res.status(200).json(bookings);
    } catch (error) { res.status(500).json({ error: 'Failed' }); }
});

app.get('/api/bookings/search', async (req, res) => {
    try {
        if(!req.query.email) return res.status(400).json({ error: 'Email required' });
        const bookings = await Booking.find({ email: req.query.email }).sort({ createdAt: -1 });
        res.status(200).json(bookings);
    } catch (error) { res.status(500).json({ error: 'Failed' }); }
});

app.patch('/api/bookings/:id/status', async (req, res) => {
    try {
        const { status } = req.body; 
        const updated = await Booking.findByIdAndUpdate(req.params.id, { status: status }, { new: true });
        
        if (status === 'Confirmed') {
            let promoDiscount = 0;
            if(updated.promoCode && updated.promoCode !== 'None') {
                const p = await Promo.findOne({ code: updated.promoCode });
                if(p) promoDiscount = p.discount;
            }

            const formattedCheckIn = formatDate(updated.checkIn);
            const formattedCheckOut = formatDate(updated.checkOut);
            const stayDates = updated.stayType === 'day' ? formattedCheckIn : `${formattedCheckIn} to ${formattedCheckOut}`;
            const stayTimes = `${formatTime(updated.checkInTime)} - ${formatTime(updated.checkOutTime)}`;
            const originalPrice = updated.totalCost + promoDiscount;
            
            let promoRow = '';
            if (promoDiscount > 0) {
                promoRow = `
                <tr style="border-bottom: 1px solid #E2E8F0;">
                    <td style="padding: 10px 0; color: #64748B;">Promo Applied (${updated.promoCode}):</td>
                    <td style="padding: 10px 0; text-align: right; font-weight: bold; color: #059669;">-₱${promoDiscount.toLocaleString('en-PH')}</td>
                </tr>`;
            }

            let paymentInstructionBlock = '';
            if (updated.paymentMode === 'GCash') {
                paymentInstructionBlock = `
                    <div style="background-color: #F8FAFC; padding: 30px; border-radius: 12px; margin-top: 35px; text-align: center; border: 1px dashed #C5A059;">
                        <h4 style="color: #141414; margin-top: 0; margin-bottom: 10px; font-family: 'Cinzel', serif; font-size: 18px; letter-spacing: 1px;">GCash Payment Details</h4>
                        <p style="color: #475569; font-size: 14px; margin-bottom: 20px; font-weight: 300;">You have selected GCash. Please settle your balance upon check-out using either of the numbers below:</p>
                        <p style="font-size: 22px; font-weight: bold; color: #141414; letter-spacing: 2px; margin: 0;">0917 887 6310<br><span style="color: #C5A059; font-size: 16px;">or</span><br>0917 592 5857</p>
                    </div>
                `;
            } else {
                paymentInstructionBlock = `
                    <div style="text-align: center; margin-top: 30px;">
                        <p style="color: #475569; font-size: 14px; margin-bottom: 15px;">You have selected Cash payment. Please settle your balance upon check-out.</p>
                    </div>
                `;
            }

            const customerContent = `
                <p>Dear <strong>${updated.guestName}</strong>,</p>
                <p>We are thrilled to inform you that your reservation at Maricarl Resort has been officially <strong style="color: #059669;">approved and confirmed</strong>.</p>
                
                <h3 style="color: #141414; margin-top: 35px; font-size: 15px; text-transform: uppercase; letter-spacing: 2px; font-family: 'Cinzel', serif; font-weight: bold;">Reservation Details</h3>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
                    <tr style="border-bottom: 1px solid #E2E8F0;"><td style="padding: 12px 0; color: #64748B; font-weight: bold;">Stay Type:</td><td style="padding: 12px 0; text-align: right; font-weight: bold; color: #141414;">${updated.stayType === 'day' ? 'Whole Day Tour' : 'Overnight Stay'}</td></tr>
                    <tr style="border-bottom: 1px solid #E2E8F0;"><td style="padding: 12px 0; color: #64748B; font-weight: bold;">Dates:</td><td style="padding: 12px 0; text-align: right; font-weight: bold; color: #141414;">${stayDates}</td></tr>
                    <tr style="border-bottom: 1px solid #E2E8F0;"><td style="padding: 12px 0; color: #64748B; font-weight: bold;">Time:</td><td style="padding: 12px 0; text-align: right; font-weight: bold; color: #141414;">${stayTimes}</td></tr>
                    <tr style="border-bottom: 1px solid #E2E8F0;"><td style="padding: 12px 0; color: #64748B; font-weight: bold;">Guests:</td><td style="padding: 12px 0; text-align: right; font-weight: bold; color: #141414;">${updated.pax} Pax</td></tr>
                    <tr style="border-bottom: 1px solid #E2E8F0;"><td style="padding: 12px 0; color: #64748B; font-weight: bold;">Phone on file:</td><td style="padding: 12px 0; text-align: right; font-weight: bold; color: #141414;">${updated.phone}</td></tr>
                    <tr style="border-bottom: 1px solid #E2E8F0;"><td style="padding: 12px 0; color: #64748B; font-weight: bold;">Payment Mode:</td><td style="padding: 12px 0; text-align: right; font-weight: bold; color: #141414;">${updated.paymentMode}</td></tr>
                </table>

                <h3 style="color: #141414; margin-top: 35px; font-size: 15px; text-transform: uppercase; letter-spacing: 2px; font-family: 'Cinzel', serif; font-weight: bold;">Payment Summary</h3>
                <table style="width: 100%; border-collapse: collapse; background-color: #F8FAFC; border-radius: 8px; overflow: hidden; border: 1px solid #E2E8F0;">
                    <tr style="border-bottom: 1px solid #E2E8F0;"><td style="padding: 15px; color: #64748B;">Original Base Rate:</td><td style="padding: 15px; text-align: right; font-weight: bold; color: #141414;">₱${originalPrice.toLocaleString('en-PH')}</td></tr>
                    ${promoRow}
                    <tr style="background-color: #141414; color: #FFF;"><td style="padding: 15px;"><strong>Final Amount Due:</strong></td><td style="padding: 15px; text-align: right; font-size: 18px; color: #C5A059;"><strong>₱${updated.totalCost.toLocaleString('en-PH')}</strong></td></tr>
                </table>
                
                ${paymentInstructionBlock}
                
                <p style="margin-top: 35px; text-align: center;">We look forward to hosting you!</p>
            `;

            try {
                await transporter.sendMail({
                    from: `"Maricarl Resort" <${MY_GMAIL}>`, 
                    to: updated.email,
                    subject: `Reservation Confirmed - Maricarl Resort`,
                    html: generateHTML('Your Booking is Confirmed', customerContent)
                });
            } catch(e) { console.log("Email error:", e.message); }
        }
        res.status(200).json(updated);
    } catch (error) { res.status(500).json({ error: 'Failed' }); }
});

app.delete('/api/bookings/:id', async (req, res) => {
    try {
        const bookingId = req.params.id;
        const source = req.query.source || 'unknown'; 
        
        const bookingToDelete = await Booking.findById(bookingId);
        if (!bookingToDelete) return res.status(404).json({ error: 'Booking not found' });

        const formattedCheckIn = formatDate(bookingToDelete.checkIn);
        const formattedCheckOut = formatDate(bookingToDelete.checkOut);
        const stayDates = bookingToDelete.stayType === 'day' ? formattedCheckIn : `${formattedCheckIn} to ${formattedCheckOut}`;

        if (source === 'admin') {
            const cancelContent = `
                <p>Dear <strong>${bookingToDelete.guestName}</strong>,</p>
                <p>We regret to inform you that your reservation request for <strong>${stayDates}</strong> has been <span style="color: #E11D48; font-weight: bold;">declined or canceled</span> by the administration.</p>
                <p>If you believe this was a mistake, or if you would like to book a different date, please submit a new reservation request on our website.</p>
                <p>Thank you for considering Maricarl Resort.</p>
            `;
            try {
                await transporter.sendMail({
                    from: `"Maricarl Resort" <${MY_GMAIL}>`,
                    to: bookingToDelete.email,
                    subject: `Reservation Canceled - Maricarl Resort`,
                    html: generateHTML('Reservation Canceled', cancelContent)
                });
            } catch(e) { console.log("Email error:", e.message); }
        }

        if (source === 'customer') {
            const adminAlertContent = `
                <p>Hello Admin,</p>
                <p>Please be advised that a guest has <span style="color: #E11D48; font-weight: bold;">canceled</span> their reservation directly from the website.</p>
                <h3 style="color: #141414; margin-top: 35px; font-size: 15px; text-transform: uppercase; letter-spacing: 2px; font-family: 'Cinzel', serif; font-weight: bold;">Canceled Details</h3>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px; background-color: #FFF1F2; border-radius: 8px; overflow: hidden; border: 1px solid #FFE4E6;">
                    <tr style="border-bottom: 1px solid #FFE4E6;"><td style="padding: 12px 15px; color: #E11D48;">Guest Name:</td><td style="padding: 12px 15px; text-align: right; font-weight: bold; color: #9F1239;">${bookingToDelete.guestName}</td></tr>
                    <tr style="border-bottom: 1px solid #FFE4E6;"><td style="padding: 12px 15px; color: #E11D48;">Email:</td><td style="padding: 12px 15px; text-align: right; font-weight: bold; color: #9F1239;">${bookingToDelete.email}</td></tr>
                    <tr style="border-bottom: 1px solid #FFE4E6;"><td style="padding: 12px 15px; color: #E11D48;">Phone:</td><td style="padding: 12px 15px; text-align: right; font-weight: bold; color: #9F1239;">${bookingToDelete.phone}</td></tr>
                    <tr style="border-bottom: 1px solid #FFE4E6;"><td style="padding: 12px 15px; color: #E11D48;">Dates:</td><td style="padding: 12px 15px; text-align: right; font-weight: bold; color: #9F1239;">${stayDates}</td></tr>
                </table>
                <p>This booking has been permanently removed from your dashboard and calendar.</p>
            `;
            try {
                await transporter.sendMail({
                    from: `"Maricarl Resort System" <${MY_GMAIL}>`,
                    to: ADMIN_EMAIL,
                    subject: `⚠️ Guest Cancellation: ${bookingToDelete.guestName}`,
                    html: generateHTML('Guest Cancellation Alert', adminAlertContent)
                });
            } catch(e) { console.log("Email error:", e.message); }
            
            const receiptContent = `
                <p>Dear <strong>${bookingToDelete.guestName}</strong>,</p>
                <p>This email is to confirm that your reservation for <strong>${stayDates}</strong> has been <span style="color: #E11D48; font-weight: bold;">successfully canceled</span> as requested.</p>
                <p>We hope to welcome you to Maricarl Resort in the future. If this was a mistake, please visit our website to make a new reservation.</p>
            `;
            try {
                await transporter.sendMail({
                    from: `"Maricarl Resort" <${MY_GMAIL}>`,
                    to: bookingToDelete.email,
                    subject: `Cancellation Confirmed - Maricarl Resort`,
                    html: generateHTML('Cancellation Processed', receiptContent)
                });
            } catch(e) { console.log("Email error:", e.message); }
        }

        await Booking.findByIdAndDelete(bookingId);
        res.status(200).json({ message: 'Reservation successfully deleted and emails sent.' });
    } catch (error) { 
        console.error(error);
        res.status(500).json({ error: 'Failed to delete' }); 
    }
});

// --- 6. API ROUTES - PROMOS ---
app.post('/api/promos', async (req, res) => {
    try {
        const newPromo = new Promo(req.body);
        await newPromo.save();
        res.status(201).json(newPromo);
    } catch (error) { res.status(500).json({ error: 'Failed' }); }
});

app.get('/api/promos', async (req, res) => {
    try {
        const promos = await Promo.find().sort({ _id: -1 }); 
        res.status(200).json(promos);
    } catch (error) { res.status(500).json({ error: 'Failed' }); }
});

app.delete('/api/promos/:id', async (req, res) => {
    try {
        await Promo.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: 'Promo deleted' });
    } catch (error) { res.status(500).json({ error: 'Failed to delete promo' }); }
});

app.get('/api/promos/verify/:code', async (req, res) => {
    try {
        const promo = await Promo.findOne({ code: req.params.code.toUpperCase() });
        if(!promo) return res.status(404).json({ error: 'Invalid code' });
        
        if(promo.expiryDate && new Date(promo.expiryDate) < new Date()) {
            promo.active = false;
            await promo.save();
            return res.status(400).json({ error: 'Promo expired' });
        }
        res.status(200).json(promo);
    } catch (error) { res.status(500).json({ error: 'Failed' }); }
});

app.listen(3000, () => console.log('🚀 Maricarl Server is running live on http://localhost:3000'));