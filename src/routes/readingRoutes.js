import express from 'express';
import {createReading, getTeacherReadings} from '../controllers/readingController.js';

const router = express.Router();

router.post('/', createReading);
router.get('/teacher/:teacherId', getTeacherReadings);
export default router;