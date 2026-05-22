const mongoose = require('mongoose');

const medicationReminderSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    prescription_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Prescription',
        required: true,
    },
    medication_name: {
        type: String,
        required: true,
    },
    dosage: {
        type: String,
        required: true,
    },
    times: {
        type: [String], // Array of 'HH:mm' strings
        required: true,
    },
    is_active: {
        type: Boolean,
        default: true,
    }
}, { timestamps: true });

module.exports = mongoose.model('MedicationReminder', medicationReminderSchema);
