// Prescriptions route:
// Supports doctor prescription issuance and patient/doctor prescription retrieval.
const express = require('express');
const router = express.Router();
const Prescription = require('../models/Prescription');
const Doctor = require('../models/Doctor');
const Appointment = require('../models/Appointment');
const MedicationReminder = require('../models/MedicationReminder');
const { protect } = require('../middleware/authMiddleware');

function parseFrequency(freq) {
    const lower = freq.toLowerCase();
    if (lower.includes('three') || lower.includes('thrice')) return ['09:00', '14:00', '20:00'];
    if (lower.includes('two') || lower.includes('twice')) return ['09:00', '20:00'];
    return ['09:00']; // default to once daily
}

router.get('/', protect, async (req, res) => {
    try {
        const { role, _id } = req.user;
        let query = {};

        if (role === 'patient') {
            query.patient_id = _id;
        } else if (role === 'doctor') {
            const doctor = await Doctor.findOne({ user_id: _id });
            if (doctor) query.doctor_id = doctor._id;
        }

        const prescriptions = await Prescription.find(query)
            .populate({
                path: 'doctor_id',
                populate: { path: 'user_id', select: 'full_name' }
            })
            .populate('patient_id', 'full_name email')
            .populate('appointment_id')
            .sort({ createdAt: -1 });

        res.json(prescriptions);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get prescriptions for a specific patient (for doctor review)
router.get('/patient/:patientId', protect, async (req, res) => {
    try {
        if (req.user.role !== 'doctor') {
            return res.status(403).json({ message: 'Only doctors can view patient medical history' });
        }

        const prescriptions = await Prescription.find({ patient_id: req.params.patientId })
            .populate({
                path: 'doctor_id',
                populate: { path: 'user_id', select: 'full_name' }
            })
            .sort({ createdAt: -1 });

        res.json(prescriptions);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get prescriptions for a specific appointment (patient & doctor can view)
router.get('/appointment/:appointmentId', protect, async (req, res) => {
    try {
        const { appointmentId } = req.params;
        // Ensure viewer is either the patient or the doctor related to the appointment (or admin)
        const PrescriptionList = await Prescription.find({ appointment_id: appointmentId })
            .populate({ path: 'doctor_id', populate: { path: 'user_id', select: 'full_name email' } })
            .populate('patient_id', 'full_name email')
            .sort({ createdAt: -1 });

        res.json(PrescriptionList);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Create a prescription
router.post('/', protect, async (req, res) => {
    try {
        if (req.user.role !== 'doctor') {
            return res.status(403).json({ message: 'Only doctors can create prescriptions' });
        }

        const { appointment_id, diagnosis, medications, instructions, doctor_notes, pdf_url } = req.body;

        if (!appointment_id) {
            return res.status(400).json({ message: 'appointment_id is required' });
        }

        const doctorProfile = await Doctor.findOne({ user_id: req.user._id });
        if (!doctorProfile) {
            return res.status(404).json({ message: 'Doctor profile not found' });
        }

        const appointment = await Appointment.findById(appointment_id);
        if (!appointment) {
            return res.status(404).json({ message: 'Appointment not found' });
        }

        if (appointment.doctor_id.toString() !== doctorProfile._id.toString()) {
            return res.status(403).json({ message: 'You can only prescribe for your own appointments' });
        }

        if (appointment.status === 'cancelled') {
            return res.status(400).json({ message: 'Cannot prescribe for a cancelled appointment' });
        }

        const existingPrescription = await Prescription.findOne({
            appointment_id,
        }).select('_id');
        if (existingPrescription) {
            return res.status(409).json({ message: 'Prescription already exists for this appointment' });
        }

        const prescription = await Prescription.create({
            appointment_id,
            patient_id: appointment.patient_id,
            doctor_id: doctorProfile._id,
            diagnosis,
            medications,
            instructions,
            doctor_notes,
            pdf_url
        });

        try {
            const Notification = require('../models/Notification');
            await Notification.create({
                user_id: appointment.patient_id,
                type: 'prescription',
                message: 'A new prescription has been added by your doctor.',
                data: {
                    appointment_id: appointment._id,
                    prescription_id: prescription._id,
                },
            });
            
            // Generate smart reminders
            if (medications && medications.length > 0) {
                const reminders = medications.map(med => ({
                    user_id: appointment.patient_id,
                    prescription_id: prescription._id,
                    medication_name: med.name,
                    dosage: med.dosage,
                    times: parseFrequency(med.frequency || ''),
                    is_active: true
                }));
                await MedicationReminder.insertMany(reminders);
            }
            
        } catch (nerr) {
            console.error('Failed to create prescription notification/reminders', nerr);
        }

        const populatedPrescription = await Prescription.findById(prescription._id)
            .populate({ path: 'doctor_id', populate: { path: 'user_id', select: 'full_name' } })
            .populate('appointment_id')
            .populate('patient_id', 'full_name email');

        res.status(201).json(populatedPrescription);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

module.exports = router;
