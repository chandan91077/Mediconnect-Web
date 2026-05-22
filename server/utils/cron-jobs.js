// Cron utilities:
// Contains scheduled/background jobs such as auto-cancel for unpaid appointments.
const cron = require('node-cron');
const Appointment = require('../models/Appointment');
const MedicationReminder = require('../models/MedicationReminder');
const { emitNotification } = require('../socket/assistantSocket');

const AUTO_CANCEL_MINUTES = 5;

const cancelExpiredUnpaidAppointments = async () => {
    const thresholdDate = new Date(Date.now() - AUTO_CANCEL_MINUTES * 60 * 1000);

    const appointmentsToCancel = await Appointment.find({
        status: 'pending',
        payment_status: 'pending',
        createdAt: { $lt: thresholdDate }
    });

    if (appointmentsToCancel.length > 0) {
        console.log(`[Auto-Cancel] Found ${appointmentsToCancel.length} unpaid appointments to cancel.`);

        for (const appt of appointmentsToCancel) {
            appt.status = 'cancelled';
            appt.payment_status = 'failed';
            appt.notes = `${appt.notes || ''} Auto-cancelled after ${AUTO_CANCEL_MINUTES} minutes due to pending payment.`.trim();
            await appt.save();
            console.log(`[Auto-Cancel] Cancelled appointment ${appt._id}`);
        }
    }

    return appointmentsToCancel.length;
};

const startAutoCancellationJob = () => {
    // Run every minute
    cron.schedule('* * * * *', async () => {
        try {
            await cancelExpiredUnpaidAppointments();
        } catch (error) {
            console.error('[Auto-Cancel] error:', error);
        }
        
        try {
            await processMedicationReminders();
        } catch (error) {
            console.error('[Medication-Reminder] error:', error);
        }
    });

    console.log('[Cron] Background jobs scheduled.');
};

const processMedicationReminders = async () => {
    const now = new Date();
    // Format to HH:mm in local time (or UTC depending on server, assuming local for now as per Date object)
    const hours = now.getHours().toString().padStart(2, '0');
    const mins = now.getMinutes().toString().padStart(2, '0');
    const currentTimeStr = `${hours}:${mins}`;

    const reminders = await MedicationReminder.find({ 
        is_active: true,
        times: currentTimeStr 
    });

    if (reminders.length > 0) {
        console.log(`[Medication-Reminder] Found ${reminders.length} reminders for ${currentTimeStr}.`);
        for (const reminder of reminders) {
            emitNotification(reminder.user_id.toString(), {
                type: 'medication',
                message: `Time to take your medication: ${reminder.dosage} of ${reminder.medication_name}.`
            });
        }
    }
};

module.exports = { startAutoCancellationJob, cancelExpiredUnpaidAppointments, processMedicationReminders };
